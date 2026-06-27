import type { Background, Env, EventDef, GameEventPublic, LeaderboardTeam, Player, RoundResult, Trait, WeeklyNewsItem } from '../types.js';
import { LlmLogger } from './logger.js';
import { fetchWithRetry } from './fetchWithRetry.js';
import {
  buildCustomActionJudgePrompt,
  buildIntroPrompt,
  buildJudgmentValidationPrompt,
  buildNarrativePrompt,
  buildShopNarrativePrompt,
  buildSocialFeedPrompt,
  buildSummaryPrompt,
  type CustomActionJudgment,
  type JudgmentValidation,
  type NarrativePromptInput,
  type ShopNarrativeInput,
  type SocialFeedPost,
} from './prompts.js';
import { analyzeEventGaps, buildEventGenPrompt, extractJsonArray, parseAiEvents } from './eventGenerator.js';
import {
  buildTraitRulesForPlayer,
  loadTraitNarrativeConfig,
  type TraitNarrativeConfig,
} from './narrativeConfig.js';
import {
  buildContentGuardPrompt,
  CONTENT_GUARD_SYSTEM_PROMPT,
  parseContentGuardVerdict,
  quickCheck,
  type ContentGuardVerdict,
} from './contentGuard.js';

export interface AiService {
  readonly active: boolean;
  narrate(input: NarrativePromptInput): Promise<string>;
  narrateStream(input: NarrativePromptInput): AsyncIterable<string>;
  narrateShopPurchase(input: ShopNarrativeInput): Promise<string>;
  summarize(player: Player, history: RoundResult[], ending?: string): Promise<string>;
  intro(player: Player, traits: Trait[], background: Background): Promise<string>;
  judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null>;
  validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation>;
  simulateSocialFeed(player: Player, recentHistory: RoundResult[], leaderboard: LeaderboardTeam[], weeklyNews?: WeeklyNewsItem[]): Promise<SocialFeedPost[]>;
  generateEvents(player: Player, history: RoundResult[], worldStorylines?: string[]): Promise<EventDef[] | null>;
  simulateLeaderboardTick?(
    teams: LeaderboardTeam[],
    player: Player,
  ): Promise<LeaderboardTeam[]>;
}

const NARRATIVE_SYSTEM_PROMPT =
  '你是一个 CS2 电竞小说的叙事引擎。全程使用第二人称"你"叙述，禁止出现"他""她"或选手姓名作主语。只输出正文，不要解释，不要加引号。\n' +
  '\n' +
  '你收到的【人物特质上下文】用于让叙事更贴合人物性格，但不要写成心理分析报告。\n' +
  '禁止凭特质名称自由联想——以收到的上下文为准。';

const SUMMARY_SYSTEM_PROMPT =
  '你是一个 CS2 电竞生涯传记作者。只输出小结正文，不要标题，不要解释。';

const INTRO_SYSTEM_PROMPT =
  '你是一个 CS2 电竞小说的开篇作者。只输出开篇正文，不要标题，不要解释。\n' +
  '\n' +
  '你收到的【特质叙事指令】用于让主角的第一次亮相就带有其性格特质。\n' +
  '禁止凭特质名称自由联想——以收到的指令为准。';

const PERSONALIZE_SYSTEM_PROMPT =
  '你是 CS2 电竞小说的叙事引擎。你的任务是根据选手特质和事件语境，精准改写叙事文案。\n' +
  '\n' +
  '全程使用第二人称"你"，禁止出现"我""他""她"或选手姓名作主语。\n' +
  '\n' +
  '【特质理解准则】你收到的【特质叙事词典】是权威定义。禁止凭特质名称自由联想。\n' +
  '例如"背锅侠"的内核是"习惯性承担责任与内疚"，不是"抱怨他人"。\n' +
  '你必须严格遵循词典中的 behaviorPatterns、forbiddenMisreads 和 emotionalCore。\n' +
  '\n' +
  '【事件语境准则】你收到的【事件元数据】定义了该事件的情感基调、玩家立场和冲突类型。\n' +
  '叙事必须贴合这些信息，不能偏离。\n' +
  '\n' +
  '严格按要求输出 JSON，不要输出任何其他内容。';

const SOCIAL_SYSTEM_PROMPT =
  '你是 CS2 职业电竞世界的社交媒体模拟引擎。\n' +
  '你收到的【主角特质映射到社媒】定义了每个特质在第三方帖子中的间接体现方式。\n' +
  '禁止凭特质名称自由联想——以收到的映射说明为准。\n' +
  '严格输出 JSON 数组，不加任何其他内容。';

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

type LlmLogPayload = Parameters<LlmLogger['log']>[0] & { error?: string };

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logLlmEvent(logger: LlmLogger | undefined, entry: LlmLogPayload): Promise<void> | undefined {
  return logger?.log(entry as Parameters<LlmLogger['log']>[0]);
}

function parseJudgmentValidation(text: string | null): { value: JudgmentValidation; parsed: boolean } {
  if (!text) return { value: { valid: true }, parsed: false }; // LLM 无响应时宽松放行
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as JudgmentValidation;
    if (typeof parsed.valid !== 'boolean') return { value: { valid: true }, parsed: false };
    return { value: parsed, parsed: true };
  } catch {
    return { value: { valid: true }, parsed: false };
  }
}

function parseCustomActionJudgment(text: string | null): { value: CustomActionJudgment | null; parsed: boolean } {
  if (!text) return { value: null, parsed: false };
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as CustomActionJudgment;
    const validQualities = new Set(['poor', 'ok', 'good', 'excellent']);
    if (!validQualities.has(parsed.quality) || typeof parsed.narrative !== 'string') return { value: null, parsed: false };
    return { value: parsed, parsed: true };
  } catch {
    return { value: null, parsed: false };
  }
}

function parseSocialFeed(text: string | null): { value: SocialFeedPost[]; parsed: boolean } {
  if (!text) return { value: [], parsed: false };
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const raw = JSON.parse(clean) as unknown;
    // Handle both bare array [...] and object-wrapped {"posts":[...]} (OpenAI json_object mode)
    const arr: unknown = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>).posts ?? (raw as Record<string, unknown>).items ?? null;
    if (!Array.isArray(arr)) return { value: [], parsed: false };
    const validTypes = new Set(['teammate', 'club', 'rival', 'media', 'star', 'industry', 'fan']);
    return {
      value: (arr as SocialFeedPost[]).filter(
        (p) =>
          typeof p.author === 'string' &&
          typeof p.content === 'string' &&
          typeof p.handle === 'string' &&
          validTypes.has(p.authorType),
      ).slice(0, 6),
      parsed: true,
    };
  } catch {
    return { value: [], parsed: false };
  }
}

const TEMPLATE_RIVAL_POSTS = [
  '训练营最后一天，就等正式开赛了，感谢大家的支持 🔥',
  '本周战绩不错，继续磨合新阵容，下一场见真章 😤',
  '赛季末冲刺阶段，每一场都不容有失 🎯',
  '感谢赞助商一路相伴，新周边即将上线，敬请期待 👕',
];

const TEMPLATE_MEDIA_OUTLETS = [
  { author: 'CS2 电竞速报', handle: '@cs2daily' },
  { author: '电子竞技周刊', handle: '@esports_weekly' },
  { author: '转会雷达', handle: '@transfer_radar' },
  { author: '赛事内幕', handle: '@match_insider' },
];

const TEMPLATE_MEDIA_POSTS = [
  '本赛季冒出不少新面孔，职业圈的新陈代谢越来越快 👀',
  '下周大赛开幕，这批种子队的状态都不错，好戏在后头 🏆',
  '转会流言不断，多支队伍正在私下接触选手 📰',
  '今日训练局直播破了平台纪录，CS2 热度持续上升 📈',
];

const TEMPLATE_STAR_HANDLES = [
  { author: 's1mple', handle: '@s1mple_legacy' },
  { author: 'ZywOo', handle: '@zywoo_beast' },
  { author: 'm0NESY', handle: '@m0nesy_ace' },
  { author: 'sh1ro', handle: '@sh1ro_sniper' },
  { author: 'ropz', handle: '@ropz_clutch' },
  { author: 'NiKo', handle: '@niko_rifle' },
];

const TEMPLATE_STAR_POSTS = [
  '刚拿到新外设，手感起飞 🎮',
  '训练赛打了个 30-8，状态不错 🔥',
  '感谢粉丝们的支持，决赛见 💪',
  '最近转会流言很多，市场挺活跃的 👀',
  '新地图池还要适应，老图细节不能丢 📋',
  '刚打完一场高质量训练赛，学到很多 📝',
];

const TEMPLATE_INDUSTRY_HANDLES = [
  { author: 'CS分析师老李', handle: '@cs_analyst' },
  { author: '解说小刘', handle: '@caster_liu' },
  { author: '圈内老炮', handle: '@insider_guru' },
  { author: '电竞观察室', handle: '@esports_observe' },
];

const TEMPLATE_INDUSTRY_POSTS = [
  '本周赛事预测：A队阵容深度占优，但B队个人能力更强 🏆',
  '新赛季观赛数据又创新高，CS2 生态越来越健康 📈',
  '某顶级选手合约即将到期，多队已经在试探 👀',
  '训练室探访：看看职业选手的一天是怎么过的 🎥',
];

function templateSocialFeed(player: Player, leaderboard: LeaderboardTeam[]): SocialFeedPost[] {
  const posts: SocialFeedPost[] = [];
  const r = player.round;

  // 队友帖（有队伍时，轮流展示不同队友）
  if (player.roster && player.roster.length > 0) {
    const tmIdx = r % player.roster.length;
    const tm = player.roster[tmIdx]!;
    posts.push({
      author: tm.name,
      authorType: 'teammate',
      handle: `@${tm.name.toLowerCase().replace(/\s+/g, '_').slice(0, 15)}`,
      content: '今天训练量很大，但感觉状态在上升 💪 继续冲！',
    });
  }

const TEMPLATE_CLUB_POSTS = [
  '战队本周训练圆满收尾，感谢球迷们一如既往的支持 ❤️',
  '新周边即将上架，记得关注官方商城 👕',
  '下周大赛预告，全员已就位，敬请期待 🏆',
  '感谢合作伙伴的持续支持，我们将继续全力以赴 🤝',
];

  // 俱乐部官号
  if (player.team) {
    const clubIdx = r % TEMPLATE_CLUB_POSTS.length;
    posts.push({
      author: player.team.name,
      authorType: 'club',
      handle: `@${player.team.tag.toLowerCase()}`,
      content: TEMPLATE_CLUB_POSTS[clubIdx]!,
    });
  }

  // 对手帖：轮转使用 player.rivals 和 leaderboard 队伍
  const worldTeams = leaderboard.filter((t) => !t.isPlayer).slice(0, 6);
  const rivalPool = (player.rivals && player.rivals.length > 0)
    ? player.rivals
    : worldTeams;
  if (rivalPool.length > 0) {
    const rivalIdx = r % rivalPool.length;
    const rivalTeam = rivalPool[rivalIdx]!;
    const contentIdx = r % TEMPLATE_RIVAL_POSTS.length;
    posts.push({
      author: rivalTeam.name,
      authorType: 'rival',
      handle: `@${rivalTeam.tag.toLowerCase()}`,
      content: TEMPLATE_RIVAL_POSTS[contentIdx]!,
    });
  }

  // 明星选手帖（每轮轮转一位不同明星）
  const starIdx = r % TEMPLATE_STAR_HANDLES.length;
  const star = TEMPLATE_STAR_HANDLES[starIdx]!;
  const starContentIdx = (r + 2) % TEMPLATE_STAR_POSTS.length;
  posts.push({
    author: star.author,
    authorType: 'star',
    handle: star.handle,
    content: TEMPLATE_STAR_POSTS[starContentIdx]!,
  });

  // 圈内/解说帖（轮转不同人士）
  const industryIdx = r % TEMPLATE_INDUSTRY_HANDLES.length;
  const industry = TEMPLATE_INDUSTRY_HANDLES[industryIdx]!;
  const industryContentIdx = (r + 3) % TEMPLATE_INDUSTRY_POSTS.length;
  posts.push({
    author: industry.author,
    authorType: 'industry',
    handle: industry.handle,
    content: TEMPLATE_INDUSTRY_POSTS[industryContentIdx]!,
  });

  // 媒体帖（轮转不同媒体账号）
  const outletIdx = r % TEMPLATE_MEDIA_OUTLETS.length;
  const outlet = TEMPLATE_MEDIA_OUTLETS[outletIdx]!;
  const mediaContentIdx = (r + 1) % TEMPLATE_MEDIA_POSTS.length;
  posts.push({
    author: outlet.author,
    authorType: 'media',
    handle: outlet.handle,
    content: TEMPLATE_MEDIA_POSTS[mediaContentIdx]!,
  });

  return posts;
}

// ── Shared SSE stream reader ─────────────────────────────────────

async function* readSseStream(
  res: Response,
  onError?: (err: unknown) => Promise<void> | void,
): AsyncGenerator<Record<string, unknown>> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data) as Record<string, unknown>;
      } catch (err) {
        await onError?.(err);
      }
    }
  }
}

// ── Template fallback (no LLM) ──────────────────────────────────

class TemplateNarrator implements AiService {
  readonly active = false;

  async narrate(input: NarrativePromptInput): Promise<string> {
    return input.baseNarrative;
  }

  async *narrateStream(input: NarrativePromptInput): AsyncGenerator<string> {
    yield input.baseNarrative;
  }

  async narrateShopPurchase(input: ShopNarrativeInput): Promise<string> {
    return input.baseNarrative;
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    const wins = history.filter((r) => r.success).length;
    const total = history.length;
    return `${player.name} 完成了 ${total} 轮生涯，胜率 ${total > 0 ? Math.round((wins / total) * 100) : 0}%。结局：${ending ?? '退役'}。`;
  }

  async intro(player: Player, _traits: Trait[], background: Background): Promise<string> {
    return `${player.name}，${background.description}这条路，没有人能替你走。`;
  }

  async judgeCustomAction(_playerInput: string, _event: GameEventPublic, _player: Player): Promise<CustomActionJudgment | null> {
    return null;
  }

  async validateJudgment(_playerInput: string, _event: GameEventPublic, _judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    return { valid: true };
  }

  async simulateSocialFeed(player: Player, _recentHistory: RoundResult[], leaderboard: LeaderboardTeam[], _weeklyNews?: WeeklyNewsItem[]): Promise<SocialFeedPost[]> {
    return templateSocialFeed(player, leaderboard);
  }

  async generateEvents(): Promise<EventDef[] | null> {
    return null;
  }
}

// ── Shared LLM base ──────────────────────────────────────────────

abstract class BaseLlmNarrator implements AiService {
  readonly active = true;
  private traitConfigPromise?: Promise<TraitNarrativeConfig>;

  constructor(protected logger?: LlmLogger, protected ctx?: WaitUntilCtx) {}

  protected async getTraitConfig(): Promise<TraitNarrativeConfig> {
    if (!this.traitConfigPromise) {
      this.traitConfigPromise = loadTraitNarrativeConfig();
    }
    return this.traitConfigPromise;
  }

  protected async buildTraitRules(player: Player): Promise<ReturnType<typeof buildTraitRulesForPlayer>> {
    const traitConfig = await this.getTraitConfig();
    return player.traits ? buildTraitRulesForPlayer(player.traits, traitConfig) : [];
  }

  protected abstract getProviderName(): string;
  protected abstract getModel(): string;
  protected abstract doChat(systemPrompt: string, userPrompt: string, maxTokens: number, jsonMode: boolean, method: string): Promise<string | null>;
  protected abstract doChatStream(systemPrompt: string, userPrompt: string, maxTokens: number, method: string): AsyncGenerator<string>;

  /**
   * ContentGuard Agent — two-tier content validation.
   *
   * Tier 1 (always): zero-cost regex against mechanic variable leaks.
   * Tier 2 (custom-action paths only): LLM worldview + injection check.
   *
   * Fails open: any LLM/parse error returns ok:true to avoid blocking legit content.
   */
  protected async guardContent(
    text: string,
    playerName: string,
    hasCustomInput: boolean,
  ): Promise<ContentGuardVerdict> {
    const quick = quickCheck(text);
    if (!quick.ok) return quick;

    if (!hasCustomInput) return { ok: true };

    const userPrompt = buildContentGuardPrompt(text, playerName, true);
    const raw = await this.doChat(CONTENT_GUARD_SYSTEM_PROMPT, userPrompt, 80, true, 'contentGuard');
    return parseContentGuardVerdict(raw);
  }

  async narrate(input: NarrativePromptInput): Promise<string> {
    const traitRules = await this.buildTraitRules(input.player);
    const text = await this.doChat(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input, traitRules), 1200, false, 'narrate');
    if (!text || text.length === 0) return input.baseNarrative;
    // ContentGuard: synchronous — blocks bad content before it reaches the caller.
    // Custom actions get full Tier-1 + Tier-2 check; standard paths get Tier-1 only.
    const verdict = await this.guardContent(text, input.player.name, !!input.customAction);
    return verdict.ok ? text : input.baseNarrative;
  }

  async *narrateStream(input: NarrativePromptInput): AsyncGenerator<string> {
    const traitRules = await this.buildTraitRules(input.player);
    const chunks: string[] = [];
    for await (const chunk of this.doChatStream(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input, traitRules), 1200, 'narrateStream')) {
      chunks.push(chunk);
      yield chunk;
    }
    // ContentGuard: background audit via waitUntil — does NOT block the stream.
    // Violations are logged to KV through the existing doChat logger.
    if (this.ctx && chunks.length > 0) {
      this.ctx.waitUntil(
        this.guardContent(chunks.join(''), input.player.name, !!input.customAction).catch(() => undefined),
      );
    }
  }

  async narrateShopPurchase(input: ShopNarrativeInput): Promise<string> {
    const traitRules = await this.buildTraitRules(input.player);
    const text = await this.doChat(NARRATIVE_SYSTEM_PROMPT, buildShopNarrativePrompt(input, traitRules), 300, false, 'narrateShopPurchase');
    if (!text || text.length === 0) return input.baseNarrative;
    const { ok } = quickCheck(text);
    return ok ? text : input.baseNarrative;
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    return (await this.doChat(SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(player, history, ending), 300, false, 'summarize')) ?? '';
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = buildTraitRulesForPlayer(traits.map((t) => t.id), traitConfig);
    return (await this.doChat(INTRO_SYSTEM_PROMPT, buildIntroPrompt(player, traits, background, traitRules), 1200, false, 'intro')) ?? '';
  }

  async judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null> {
    const userPrompt = buildCustomActionJudgePrompt(playerInput, event, player);
    const text = await this.doChat(PERSONALIZE_SYSTEM_PROMPT, userPrompt, 150, true, 'judgeCustomAction');
    const parsed = parseCustomActionJudgment(text);
    if (text && !parsed.parsed) {
      await logLlmEvent(this.logger, {
        method: 'judgeCustomAction',
        provider: this.getProviderName(),
        model: this.getModel(),
        systemPrompt: PERSONALIZE_SYSTEM_PROMPT,
        userPrompt,
        response: text,
        error: 'parse failed',
        latencyMs: 0,
        stream: false,
      });
    }
    return parsed.value;
  }

  async validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    const userPrompt = buildJudgmentValidationPrompt(playerInput, event, judgment);
    const text = await this.doChat(PERSONALIZE_SYSTEM_PROMPT, userPrompt, 80, true, 'validateJudgment');
    const parsed = parseJudgmentValidation(text);
    if (text && !parsed.parsed) {
      await logLlmEvent(this.logger, {
        method: 'validateJudgment',
        provider: this.getProviderName(),
        model: this.getModel(),
        systemPrompt: PERSONALIZE_SYSTEM_PROMPT,
        userPrompt,
        response: text,
        error: 'parse failed',
        latencyMs: 0,
        stream: false,
      });
    }
    return parsed.value;
  }

  async simulateSocialFeed(player: Player, recentHistory: RoundResult[], leaderboard: LeaderboardTeam[], _weeklyNews?: WeeklyNewsItem[]): Promise<SocialFeedPost[]> {
    const traitRules = await this.buildTraitRules(player);
    const userPrompt = buildSocialFeedPrompt(player, recentHistory, leaderboard, traitRules);
    const text = await this.doChat(SOCIAL_SYSTEM_PROMPT, userPrompt, 1500, false, 'simulateSocialFeed');
    const posts = parseSocialFeed(text);
    if (text && !posts.parsed) {
      await logLlmEvent(this.logger, {
        method: 'simulateSocialFeed',
        provider: this.getProviderName(),
        model: this.getModel(),
        systemPrompt: SOCIAL_SYSTEM_PROMPT,
        userPrompt,
        response: text,
        error: 'parse failed',
        latencyMs: 0,
        stream: false,
      });
    }
    // PostFilter Agent: remove posts that contain mechanic variable leaks.
    // Social posts can use third-person ("他/她") legitimately, so persona check is skipped here.
    const filtered = posts.value.filter((p) => quickCheck(p.content).ok);
    return filtered.length > 0 ? filtered : templateSocialFeed(player, leaderboard);
  }

  async generateEvents(player: Player, history: RoundResult[], worldStorylines: string[] = []): Promise<EventDef[] | null> {
    const gaps = analyzeEventGaps(player, history);
    const prompt = buildEventGenPrompt({ player, recentHistory: history, gaps, worldStorylines });
    const text = await this.doChat(
      '你是一个 CS2 电竞生涯的事件设计师。只输出 JSON 数组，不加任何其他内容。',
      prompt,
      1200,
      true,
      'generateEvents',
    );
    const jsonArrayFound = extractJsonArray(text) !== null;
    const { valid, invalid } = parseAiEvents(text);
    if (this.logger) {
      await this.logger.log({
        method: 'generateEventsParsed',
        provider: this.getProviderName(),
        model: this.getModel(),
        systemPrompt: '',
        userPrompt: prompt,
        response: JSON.stringify({
          jsonArrayFound,
          validCount: valid.length,
          invalidCount: invalid.length,
          validIds: valid.map((e) => e.id),
        }),
        error: valid.length === 0 ? 'no valid AI events after parsing/validation' : undefined,
        latencyMs: 0,
        stream: false,
      });
    }
    if (invalid.length > 0 && this.logger) {
      await this.logger.log({
        method: 'generateEventsInvalid',
        provider: this.getProviderName(),
        model: this.getModel(),
        systemPrompt: '',
        userPrompt: prompt,
        response: JSON.stringify(invalid),
        error: `invalid count: ${invalid.length}`,
        latencyMs: 0,
        stream: false,
      });
    }
    return valid.length > 0 ? valid : null;
  }
}

// ── Anthropic ────────────────────────────────────────────────────

class AnthropicNarrator extends BaseLlmNarrator {
  constructor(private apiKey: string, private model: string, logger?: LlmLogger, ctx?: WaitUntilCtx) {
    super(logger, ctx);
  }

  protected getProviderName(): string { return 'anthropic'; }
  protected getModel(): string { return this.model; }

  private buildBody(system: string, user: string, maxTokens: number, stream = false) {
    return JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      stream,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
  }

  private getHeaders() {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    };
  }

  protected async doChat(systemPrompt: string, userPrompt: string, maxTokens: number, _jsonMode: boolean, method: string): Promise<string | null> {
    const t0 = Date.now();
    try {
      const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.buildBody(systemPrompt, userPrompt, maxTokens),
      });
      if (!res.ok) {
        const errorBody = await res.text().catch(() => `HTTP ${res.status}`);
        await logLlmEvent(this.logger, { method, provider: 'anthropic', model: this.model, systemPrompt, userPrompt, response: null, error: errorBody, latencyMs: Date.now() - t0, stream: false });
        return null;
      }
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const response = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
      await logLlmEvent(this.logger, { method, provider: 'anthropic', model: this.model, systemPrompt, userPrompt, response, latencyMs: Date.now() - t0, stream: false });
      return response;
    } catch (err) {
      await logLlmEvent(this.logger, { method, provider: 'anthropic', model: this.model, systemPrompt, userPrompt, response: null, error: getErrorMessage(err), latencyMs: Date.now() - t0, stream: false });
      return null;
    }
  }

  protected async *doChatStream(systemPrompt: string, userPrompt: string, maxTokens: number, method: string): AsyncGenerator<string> {
    const t0 = Date.now();
    const chunks: string[] = [];
    let streamError: string | undefined;
    try {
      const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.buildBody(systemPrompt, userPrompt, maxTokens, true),
      });
      if (!res.ok) {
        streamError = await res.text().catch(() => `HTTP ${res.status}`);
        return;
      }
      for await (const ev of readSseStream(res, async (err) => { streamError = getErrorMessage(err); })) {
        const e = ev as { type: string; delta?: { type: string; text?: string } };
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
          chunks.push(e.delta.text);
          yield e.delta.text;
        }
      }
    } catch (err) {
      streamError = getErrorMessage(err);
    } finally {
      await logLlmEvent(this.logger, { method, provider: 'anthropic', model: this.model, systemPrompt, userPrompt, response: chunks.join(''), error: streamError, latencyMs: Date.now() - t0, stream: true });
    }
  }
}

// ── OpenAI-compatible ────────────────────────────────────────────

class OpenAINarrator extends BaseLlmNarrator {
  constructor(private apiKey: string, private model: string, private baseUrl: string, logger?: LlmLogger, ctx?: WaitUntilCtx) {
    super(logger, ctx);
  }

  protected getProviderName(): string { return 'openai'; }
  protected getModel(): string { return this.model; }

  protected async doChat(systemPrompt: string, userPrompt: string, maxTokens: number, jsonMode: boolean, method: string): Promise<string | null> {
    const t0 = Date.now();
    try {
      const body: Record<string, unknown> = {
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      };
      if (jsonMode) body.response_format = { type: 'json_object' };
      const res = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errorBody = await res.text().catch(() => `HTTP ${res.status}`);
        await logLlmEvent(this.logger, { method, provider: 'openai', model: this.model, systemPrompt, userPrompt, response: null, error: errorBody, latencyMs: Date.now() - t0, stream: false });
        return null;
      }
      const data = (await res.json()) as OpenAIChatResponse;
      const response = data.choices?.[0]?.message?.content?.trim() ?? null;
      await logLlmEvent(this.logger, { method, provider: 'openai', model: this.model, systemPrompt, userPrompt, response, latencyMs: Date.now() - t0, stream: false });
      return response;
    } catch (err) {
      await logLlmEvent(this.logger, { method, provider: 'openai', model: this.model, systemPrompt, userPrompt, response: null, error: getErrorMessage(err), latencyMs: Date.now() - t0, stream: false });
      return null;
    }
  }

  protected async *doChatStream(systemPrompt: string, userPrompt: string, maxTokens: number, method: string): AsyncGenerator<string> {
    const t0 = Date.now();
    const chunks: string[] = [];
    let streamError: string | undefined;
    try {
      const res = await fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!res.ok) {
        streamError = await res.text().catch(() => `HTTP ${res.status}`);
        return;
      }
      for await (const ev of readSseStream(res, async (err) => { streamError = getErrorMessage(err); })) {
        const text = (ev as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text) {
          chunks.push(text);
          yield text;
        }
      }
    } catch (err) {
      streamError = getErrorMessage(err);
    } finally {
      await logLlmEvent(this.logger, { method, provider: 'openai', model: this.model, systemPrompt, userPrompt, response: chunks.join(''), error: streamError, latencyMs: Date.now() - t0, stream: true });
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────

type WaitUntilCtx = { waitUntil(p: Promise<unknown>): void };

export function makeAiService(env: Env, ctx?: WaitUntilCtx): AiService {
  const provider = (env.AI_PROVIDER ?? 'none').toLowerCase();
  const logger = env.KV ? new LlmLogger(env.KV, ctx) : undefined;

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    const model = env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
    return new AnthropicNarrator(env.ANTHROPIC_API_KEY, model, logger, ctx);
  }

  if (provider === 'openai' && env.OPENAI_API_KEY) {
    const model = env.AI_MODEL ?? 'gpt-4o-mini';
    const baseUrl = (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    return new OpenAINarrator(env.OPENAI_API_KEY, model, baseUrl, logger, ctx);
  }

  return new TemplateNarrator();
}

export { LlmLogger };
