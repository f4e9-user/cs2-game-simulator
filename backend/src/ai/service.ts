import type { Background, Env, GameEventPublic, LeaderboardTeam, Player, RoundResult, Trait } from '../types.js';
import { LlmLogger } from './logger.js';
import {
  buildCustomActionJudgePrompt,
  buildIntroPrompt,
  buildJudgmentValidationPrompt,
  buildNarrativePrompt,
  buildPersonalizePrompt,
  buildSocialFeedPrompt,
  buildSummaryPrompt,
  type CustomActionJudgment,
  type JudgmentValidation,
  type NarrativePromptInput,
  type PersonalizedEvent,
  type SocialFeedPost,
} from './prompts.js';
import {
  buildTraitRulesForPlayer,
  loadEventNarrativeMeta,
  loadTraitNarrativeConfig,
  resolveNarrativeMeta,
  type EventNarrativeOverride,
  type EventNarrativeMetaConfig,
  type TraitNarrativeConfig,
} from './narrativeConfig.js';

export interface AiService {
  readonly active: boolean;
  narrate(input: NarrativePromptInput): Promise<string>;
  narrateStream(input: NarrativePromptInput): AsyncIterable<string>;
  summarize(player: Player, history: RoundResult[], ending?: string): Promise<string>;
  intro(player: Player, traits: Trait[], background: Background): Promise<string>;
  personalizeEvent(player: Player, traits: Trait[], event: GameEventPublic): Promise<PersonalizedEvent | null>;
  judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null>;
  validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation>;
  simulateSocialFeed(player: Player, recentHistory: RoundResult[], leaderboard: LeaderboardTeam[]): Promise<SocialFeedPost[]>;
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

function parseJudgmentValidation(text: string | null): JudgmentValidation {
  if (!text) return { valid: true }; // LLM 无响应时宽松放行
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as JudgmentValidation;
    if (typeof parsed.valid !== 'boolean') return { valid: true };
    return parsed;
  } catch {
    return { valid: true };
  }
}

function parseCustomActionJudgment(text: string | null): CustomActionJudgment | null {
  if (!text) return null;
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as CustomActionJudgment;
    const validQualities = new Set(['poor', 'ok', 'good', 'excellent']);
    if (!validQualities.has(parsed.quality) || typeof parsed.narrative !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function parsePersonalized(text: string | null, event: GameEventPublic): PersonalizedEvent | null {
  if (!text) return null;
  try {
    // 有时 LLM 会在 JSON 外包一层 ```json ... ```
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as PersonalizedEvent;
    if (typeof parsed.narrative !== 'string' || !Array.isArray(parsed.choices)) return null;
    // 确保每个 choice 有 id 且原事件存在该 id
    const validIds = new Set(event.choices.map((c) => c.id));
    const allValid = parsed.choices.every(
      (c) => typeof c.id === 'string' && validIds.has(c.id) && typeof c.description === 'string',
    );
    return allValid ? parsed : null;
  } catch {
    return null;
  }
}

function parseSocialFeed(text: string | null): SocialFeedPost[] {
  if (!text) return [];
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const raw = JSON.parse(clean) as unknown;
    // Handle both bare array [...] and object-wrapped {"posts":[...]} (OpenAI json_object mode)
    const arr: unknown = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>).posts ?? (raw as Record<string, unknown>).items ?? null;
    if (!Array.isArray(arr)) return [];
    const validTypes = new Set(['teammate', 'club', 'rival', 'media']);
    return (arr as SocialFeedPost[]).filter(
      (p) =>
        typeof p.author === 'string' &&
        typeof p.content === 'string' &&
        typeof p.handle === 'string' &&
        validTypes.has(p.authorType),
    ).slice(0, 5);
  } catch {
    return [];
  }
}

function getEventNarrativeMeta(event: GameEventPublic): EventNarrativeOverride | undefined {
  return (event as GameEventPublic & { narrativeMeta?: EventNarrativeOverride }).narrativeMeta;
}

const TEMPLATE_RIVAL_POSTS = [
  '训练营最后一天，状态调得不错，就等开赛了 🔥',
  '排位又是一条连胜，感觉这个版本我们吃透了 😤',
  '和队友刚复盘完昨天的比赛，细节还得抠 📋',
  '赛季快结束了，接下来才是真正的考验 🎯',
];

const TEMPLATE_MEDIA_POSTS = [
  '本赛季冒出不少新面孔，职业圈的新陈代谢越来越快 👀',
  '下周大赛开幕，这批种子队的状态都不错，好戏在后头 🏆',
  '转会窗口流言满天飞，圈内消息人士称多支队伍在接触自由人 📰',
  '今日训练局直播破了平台纪录，CS2 热度持续上升 📈',
];

function templateSocialFeed(player: Player, leaderboard: LeaderboardTeam[]): SocialFeedPost[] {
  const posts: SocialFeedPost[] = [];

  // 队友帖（有队伍时）
  if (player.roster && player.roster.length > 0) {
    const tm = player.roster[0]!;
    posts.push({
      author: tm.name,
      authorType: 'teammate',
      handle: `@${tm.name.toLowerCase().replace(/\s+/g, '_').slice(0, 15)}`,
      content: '今天训练量很大，但感觉状态在上升 💪 继续冲！',
    });
  }

  // 俱乐部官号
  if (player.team) {
    posts.push({
      author: player.team.name,
      authorType: 'club',
      handle: `@${player.team.tag.toLowerCase()}`,
      content: '战队本周训练圆满收尾，感谢球迷们一如既往的支持 ❤️',
    });
  }

  // 排行榜上的其他战队（对手发推，世界始终在运转）
  const worldTeams = leaderboard.filter((t) => !t.isPlayer).slice(0, 4);
  const rivalTeam = player.rivals?.[0] ?? worldTeams[0];
  if (rivalTeam) {
    const idx = player.round % TEMPLATE_RIVAL_POSTS.length;
    posts.push({
      author: rivalTeam.name,
      authorType: 'rival',
      handle: `@${rivalTeam.tag.toLowerCase()}`,
      content: TEMPLATE_RIVAL_POSTS[idx]!,
    });
  }

  // 媒体帖（始终存在，无论玩家有无队伍）
  const mediaIdx = (player.round + 1) % TEMPLATE_MEDIA_POSTS.length;
  posts.push({
    author: 'CS2 电竞速报',
    authorType: 'media',
    handle: '@cs2daily',
    content: TEMPLATE_MEDIA_POSTS[mediaIdx]!,
  });

  return posts;
}

// ── Shared SSE stream reader ─────────────────────────────────────

async function* readSseStream(res: Response): AsyncGenerator<Record<string, unknown>> {
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
      } catch {}
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

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    const wins = history.filter((r) => r.success).length;
    const total = history.length;
    return `${player.name} 完成了 ${total} 轮生涯，胜率 ${total > 0 ? Math.round((wins / total) * 100) : 0}%。结局：${ending ?? '退役'}。`;
  }

  async intro(player: Player, _traits: Trait[], background: Background): Promise<string> {
    return `${player.name}，${background.description}这条路，没有人能替你走。`;
  }

  async personalizeEvent(_player: Player, _traits: Trait[], _event: GameEventPublic): Promise<PersonalizedEvent | null> {
    return null;
  }

  async judgeCustomAction(_playerInput: string, _event: GameEventPublic, _player: Player): Promise<CustomActionJudgment | null> {
    return null;
  }

  async validateJudgment(_playerInput: string, _event: GameEventPublic, _judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    return { valid: true };
  }

  async simulateSocialFeed(player: Player, _recentHistory: RoundResult[], leaderboard: LeaderboardTeam[]): Promise<SocialFeedPost[]> {
    return templateSocialFeed(player, leaderboard);
  }
}

// ── Anthropic ────────────────────────────────────────────────────

class AnthropicNarrator implements AiService {
  readonly active = true;
  private traitConfigPromise?: Promise<TraitNarrativeConfig>;
  private eventMetaPromise?: Promise<EventNarrativeMetaConfig>;

  constructor(private apiKey: string, private model: string, private logger?: LlmLogger) {}

  private async getTraitConfig(): Promise<TraitNarrativeConfig> {
    if (!this.traitConfigPromise) {
      this.traitConfigPromise = loadTraitNarrativeConfig();
    }
    return this.traitConfigPromise;
  }

  private async getEventMeta(): Promise<EventNarrativeMetaConfig> {
    if (!this.eventMetaPromise) {
      this.eventMetaPromise = loadEventNarrativeMeta();
    }
    return this.eventMetaPromise;
  }

  private anthropicBody(system: string, user: string, maxTokens: number, stream = false) {
    return JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      stream,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
  }

  private anthropicHeaders() {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    };
  }

  private async *anthropicChatStream(system: string, user: string, maxTokens: number, method: string): AsyncGenerator<string> {
    const t0 = Date.now();
    const chunks: string[] = [];
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.anthropicHeaders(),
        body: this.anthropicBody(system, user, maxTokens, true),
      });
      if (!res.ok) return;
      for await (const ev of readSseStream(res)) {
        const e = ev as { type: string; delta?: { type: string; text?: string } };
        if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
          chunks.push(e.delta.text);
          yield e.delta.text;
        }
      }
    } catch {
    } finally {
      // waitUntil tracks this past stream close; without ctx it's best-effort
      this.logger?.log({ method, provider: 'anthropic', model: this.model, systemPrompt: system, userPrompt: user, response: chunks.join(''), latencyMs: Date.now() - t0, stream: true });
    }
  }

  private async anthropicChat(system: string, user: string, maxTokens: number, method: string): Promise<string | null> {
    const t0 = Date.now();
    let response: string | null = null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: this.anthropicHeaders(),
        body: this.anthropicBody(system, user, maxTokens),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      response = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
      return response;
    } catch {
      return null;
    } finally {
      // Awaited here — this runs within the request so KV write completes reliably
      await this.logger?.log({ method, provider: 'anthropic', model: this.model, systemPrompt: system, userPrompt: user, response, latencyMs: Date.now() - t0, stream: false });
    }
  }

  async narrate(input: NarrativePromptInput): Promise<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = input.player.traits
      ? buildTraitRulesForPlayer(input.player.traits, traitConfig)
      : [];
    const text = await this.anthropicChat(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input, traitRules), 500, 'narrate');
    return text && text.length > 0 ? text : input.baseNarrative;
  }

  async *narrateStream(input: NarrativePromptInput): AsyncGenerator<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = input.player.traits
      ? buildTraitRulesForPlayer(input.player.traits, traitConfig)
      : [];
    yield* this.anthropicChatStream(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input, traitRules), 500, 'narrateStream');
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    return (await this.anthropicChat(SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(player, history, ending), 300, 'summarize')) ?? '';
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = buildTraitRulesForPlayer(
      traits.map((t) => t.id),
      traitConfig,
    );

    return (await this.anthropicChat(
      INTRO_SYSTEM_PROMPT,
      buildIntroPrompt(player, traits, background, traitRules),
      300,
      'intro',
    )) ?? '';
  }

  async personalizeEvent(player: Player, traits: Trait[], event: GameEventPublic): Promise<PersonalizedEvent | null> {
    const [traitConfig, eventMetaConfig] = await Promise.all([
      this.getTraitConfig(),
      this.getEventMeta(),
    ]);
    const traitRules = buildTraitRulesForPlayer(
      traits.map((t) => t.id),
      traitConfig,
    );
    const narrativeMeta = getEventNarrativeMeta(event);
    const eventMeta = resolveNarrativeMeta(
      event.type,
      event.id,
      narrativeMeta ? [narrativeMeta] : undefined,
      eventMetaConfig,
    );

    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildPersonalizePrompt(player, traits, event, traitRules, eventMeta),
      600,
      'personalizeEvent',
    );
    return parsePersonalized(text, event);
  }

  async judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null> {
    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildCustomActionJudgePrompt(playerInput, event, player),
      150,
      'judgeCustomAction',
    );
    return parseCustomActionJudgment(text);
  }

  async validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildJudgmentValidationPrompt(playerInput, event, judgment),
      80,
      'validateJudgment',
    );
    return parseJudgmentValidation(text);
  }

  async simulateSocialFeed(player: Player, recentHistory: RoundResult[], leaderboard: LeaderboardTeam[]): Promise<SocialFeedPost[]> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = player.traits
      ? buildTraitRulesForPlayer(player.traits, traitConfig)
      : [];
    const text = await this.anthropicChat(
      SOCIAL_SYSTEM_PROMPT,
      buildSocialFeedPrompt(player, recentHistory, leaderboard, traitRules),
      500,
      'simulateSocialFeed',
    );
    const posts = parseSocialFeed(text);
    return posts.length > 0 ? posts : templateSocialFeed(player, leaderboard);
  }
}

// ── OpenAI-compatible ────────────────────────────────────────────

class OpenAINarrator implements AiService {
  readonly active = true;
  private traitConfigPromise?: Promise<TraitNarrativeConfig>;
  private eventMetaPromise?: Promise<EventNarrativeMetaConfig>;

  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string,
    private logger?: LlmLogger,
  ) {}

  private async getTraitConfig(): Promise<TraitNarrativeConfig> {
    if (!this.traitConfigPromise) {
      this.traitConfigPromise = loadTraitNarrativeConfig();
    }
    return this.traitConfigPromise;
  }

  private async getEventMeta(): Promise<EventNarrativeMetaConfig> {
    if (!this.eventMetaPromise) {
      this.eventMetaPromise = loadEventNarrativeMeta();
    }
    return this.eventMetaPromise;
  }

  private async *chatStream(systemPrompt: string, userPrompt: string, maxTokens: number, method: string): AsyncGenerator<string> {
    const t0 = Date.now();
    const chunks: string[] = [];
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
      if (!res.ok) return;
      for await (const ev of readSseStream(res)) {
        const text = (ev as { choices?: Array<{ delta?: { content?: string } }> })
          .choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text) {
          chunks.push(text);
          yield text;
        }
      }
    } catch {
    } finally {
      this.logger?.log({ method, provider: 'openai', model: this.model, systemPrompt, userPrompt, response: chunks.join(''), latencyMs: Date.now() - t0, stream: true });
    }
  }

  private async chat(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    jsonMode = false,
    method = 'unknown',
  ): Promise<string | null> {
    const t0 = Date.now();
    let response: string | null = null;
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
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as OpenAIChatResponse;
      response = data.choices?.[0]?.message?.content?.trim() ?? null;
      return response;
    } catch {
      return null;
    } finally {
      await this.logger?.log({ method, provider: 'openai', model: this.model, systemPrompt, userPrompt, response, latencyMs: Date.now() - t0, stream: false });
    }
  }

  async narrate(input: NarrativePromptInput): Promise<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = input.player.traits
      ? buildTraitRulesForPlayer(input.player.traits, traitConfig)
      : [];
    const text = await this.chat(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input, traitRules), 500, false, 'narrate');
    return text && text.length > 0 ? text : input.baseNarrative;
  }

  async *narrateStream(input: NarrativePromptInput): AsyncGenerator<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = input.player.traits
      ? buildTraitRulesForPlayer(input.player.traits, traitConfig)
      : [];
    yield* this.chatStream(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input, traitRules), 500, 'narrateStream');
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    return (await this.chat(SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(player, history, ending), 300, false, 'summarize')) ?? '';
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = buildTraitRulesForPlayer(
      traits.map((t) => t.id),
      traitConfig,
    );

    return (await this.chat(
      INTRO_SYSTEM_PROMPT,
      buildIntroPrompt(player, traits, background, traitRules),
      300,
      false,
      'intro',
    )) ?? '';
  }

  async personalizeEvent(player: Player, traits: Trait[], event: GameEventPublic): Promise<PersonalizedEvent | null> {
    const [traitConfig, eventMetaConfig] = await Promise.all([
      this.getTraitConfig(),
      this.getEventMeta(),
    ]);
    const traitRules = buildTraitRulesForPlayer(
      traits.map((t) => t.id),
      traitConfig,
    );
    const narrativeMeta = getEventNarrativeMeta(event);
    const eventMeta = resolveNarrativeMeta(
      event.type,
      event.id,
      narrativeMeta ? [narrativeMeta] : undefined,
      eventMetaConfig,
    );

    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildPersonalizePrompt(player, traits, event, traitRules, eventMeta),
      600,
      true,
      'personalizeEvent',
    );
    return parsePersonalized(text, event);
  }

  async judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null> {
    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildCustomActionJudgePrompt(playerInput, event, player),
      150,
      true,
      'judgeCustomAction',
    );
    return parseCustomActionJudgment(text);
  }

  async validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildJudgmentValidationPrompt(playerInput, event, judgment),
      80,
      true,
      'validateJudgment',
    );
    return parseJudgmentValidation(text);
  }

  async simulateSocialFeed(player: Player, recentHistory: RoundResult[], leaderboard: LeaderboardTeam[]): Promise<SocialFeedPost[]> {
    const traitConfig = await this.getTraitConfig();
    const traitRules = player.traits
      ? buildTraitRulesForPlayer(player.traits, traitConfig)
      : [];
    const text = await this.chat(
      SOCIAL_SYSTEM_PROMPT,
      buildSocialFeedPrompt(player, recentHistory, leaderboard, traitRules),
      500,
      false,
      'simulateSocialFeed',
    );
    const posts = parseSocialFeed(text);
    return posts.length > 0 ? posts : templateSocialFeed(player, leaderboard);
  }
}

// ── Factory ──────────────────────────────────────────────────────

type WaitUntilCtx = { waitUntil(p: Promise<unknown>): void };

export function makeAiService(env: Env, ctx?: WaitUntilCtx): AiService {
  const provider = (env.AI_PROVIDER ?? 'none').toLowerCase();
  const logger = env.KV ? new LlmLogger(env.KV, ctx) : undefined;

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    const model = env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
    return new AnthropicNarrator(env.ANTHROPIC_API_KEY, model, logger);
  }

  if (provider === 'openai' && env.OPENAI_API_KEY) {
    const model = env.AI_MODEL ?? 'gpt-4o-mini';
    const baseUrl = (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    return new OpenAINarrator(env.OPENAI_API_KEY, model, baseUrl, logger);
  }

  return new TemplateNarrator();
}

export { LlmLogger };
