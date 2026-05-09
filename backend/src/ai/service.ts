import type { Background, Env, GameEventPublic, LeaderboardTeam, Player, RoundResult, Trait } from '../types.js';
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

export interface AiService {
  readonly active: boolean;
  narrate(input: NarrativePromptInput): Promise<string>;
  summarize(player: Player, history: RoundResult[], ending?: string): Promise<string>;
  intro(player: Player, traits: Trait[], background: Background): Promise<string>;
  personalizeEvent(player: Player, traits: Trait[], event: GameEventPublic): Promise<PersonalizedEvent | null>;
  judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null>;
  validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation>;
  simulateSocialFeed(player: Player, recentHistory: RoundResult[]): Promise<SocialFeedPost[]>;
  simulateLeaderboardTick?(
    teams: LeaderboardTeam[],
    player: Player,
  ): Promise<LeaderboardTeam[]>;
}

const NARRATIVE_SYSTEM_PROMPT =
  '你是一个 CS2 电竞小说的叙事引擎。只输出润色后的正文，不要解释，不要加引号。';

const SUMMARY_SYSTEM_PROMPT =
  '你是一个 CS2 电竞生涯传记作者。只输出小结正文，不要标题，不要解释。';

const INTRO_SYSTEM_PROMPT =
  '你是一个 CS2 电竞小说的开篇作者。只输出开篇正文，不要标题，不要解释。';

const PERSONALIZE_SYSTEM_PROMPT =
  '你是 CS2 电竞小说的叙事引擎。严格按要求输出 JSON，不要输出任何其他内容。';

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
    const parsed = JSON.parse(clean) as SocialFeedPost[];
    if (!Array.isArray(parsed)) return [];
    const validTypes = new Set(['teammate', 'club', 'rival', 'media']);
    return parsed.filter(
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

function templateSocialFeed(player: Player): SocialFeedPost[] {
  const posts: SocialFeedPost[] = [];
  if (player.roster && player.roster.length > 0) {
    const tm = player.roster[0];
    posts.push({
      author: tm.name,
      authorType: 'teammate',
      handle: `@${tm.name.toLowerCase().replace(/\s+/g, '_').slice(0, 15)}`,
      content: '今天训练量很大，但感觉状态在上升 💪 继续冲！',
    });
  }
  if (player.team) {
    posts.push({
      author: player.team.name,
      authorType: 'club',
      handle: `@${player.team.tag.toLowerCase()}`,
      content: `战队本周训练圆满收尾，感谢球迷们一如既往的支持 ❤️`,
    });
  }
  const rival = player.rivals?.[0];
  if (rival) {
    posts.push({
      author: rival.name,
      authorType: 'rival',
      handle: `@${rival.tag.toLowerCase()}`,
      content: '最近状态很好，期待下次大赛见真章 🔥',
    });
  }
  if (posts.length === 0) {
    posts.push({
      author: 'CS2 电竞资讯',
      authorType: 'media',
      handle: '@cs2esports',
      content: '赛季新星辈出，哪位选手能脱颖而出？我们拭目以待！',
    });
  }
  return posts;
}

// ── Template fallback (no LLM) ──────────────────────────────────

class TemplateNarrator implements AiService {
  readonly active = false;

  async narrate(input: NarrativePromptInput): Promise<string> {
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

  async personalizeEvent(_player: Player, _traits: Trait[], _event: GameEventPublic): Promise<PersonalizedEvent | null> {
    return null;
  }

  async judgeCustomAction(_playerInput: string, _event: GameEventPublic, _player: Player): Promise<CustomActionJudgment | null> {
    return null;
  }

  async validateJudgment(_playerInput: string, _event: GameEventPublic, _judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    return { valid: true };
  }

  async simulateSocialFeed(player: Player, _recentHistory: RoundResult[]): Promise<SocialFeedPost[]> {
    return templateSocialFeed(player);
  }
}

// ── Anthropic ────────────────────────────────────────────────────

class AnthropicNarrator implements AiService {
  readonly active = true;
  constructor(private apiKey: string, private model: string) {}

  private async anthropicChat(system: string, user: string, maxTokens: number): Promise<string | null> {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      return data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
    } catch {
      return null;
    }
  }

  async narrate(input: NarrativePromptInput): Promise<string> {
    const text = await this.anthropicChat(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input), 200);
    return text && text.length > 0 ? text : input.baseNarrative;
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    return (await this.anthropicChat(SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(player, history, ending), 300)) ?? '';
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
    return (await this.anthropicChat(
      INTRO_SYSTEM_PROMPT,
      buildIntroPrompt(player, traits, background),
      300,
    )) ?? '';
  }

  async personalizeEvent(player: Player, traits: Trait[], event: GameEventPublic): Promise<PersonalizedEvent | null> {
    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildPersonalizePrompt(player, traits, event),
      600,
    );
    return parsePersonalized(text, event);
  }

  async judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null> {
    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildCustomActionJudgePrompt(playerInput, event, player),
      150,
    );
    return parseCustomActionJudgment(text);
  }

  async validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildJudgmentValidationPrompt(playerInput, event, judgment),
      80,
    );
    return parseJudgmentValidation(text);
  }

  async simulateSocialFeed(player: Player, recentHistory: RoundResult[]): Promise<SocialFeedPost[]> {
    const text = await this.anthropicChat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildSocialFeedPrompt(player, recentHistory),
      400,
    );
    const posts = parseSocialFeed(text);
    return posts.length > 0 ? posts : templateSocialFeed(player);
  }
}

// ── OpenAI-compatible ────────────────────────────────────────────

class OpenAINarrator implements AiService {
  readonly active = true;
  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string,
  ) {}

  private async chat(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    jsonMode = false,
  ): Promise<string | null> {
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
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  async narrate(input: NarrativePromptInput): Promise<string> {
    const text = await this.chat(NARRATIVE_SYSTEM_PROMPT, buildNarrativePrompt(input), 200);
    return text && text.length > 0 ? text : input.baseNarrative;
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    return (await this.chat(SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt(player, history, ending), 300)) ?? '';
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
    return (await this.chat(
      INTRO_SYSTEM_PROMPT,
      buildIntroPrompt(player, traits, background),
      300,
    )) ?? '';
  }

  async personalizeEvent(player: Player, traits: Trait[], event: GameEventPublic): Promise<PersonalizedEvent | null> {
    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildPersonalizePrompt(player, traits, event),
      600,
      true, // json_object mode
    );
    return parsePersonalized(text, event);
  }

  async judgeCustomAction(playerInput: string, event: GameEventPublic, player: Player): Promise<CustomActionJudgment | null> {
    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildCustomActionJudgePrompt(playerInput, event, player),
      150,
      true,
    );
    return parseCustomActionJudgment(text);
  }

  async validateJudgment(playerInput: string, event: GameEventPublic, judgment: CustomActionJudgment): Promise<JudgmentValidation> {
    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildJudgmentValidationPrompt(playerInput, event, judgment),
      80,
      true,
    );
    return parseJudgmentValidation(text);
  }

  async simulateSocialFeed(player: Player, recentHistory: RoundResult[]): Promise<SocialFeedPost[]> {
    const text = await this.chat(
      PERSONALIZE_SYSTEM_PROMPT,
      buildSocialFeedPrompt(player, recentHistory),
      400,
      true,
    );
    const posts = parseSocialFeed(text);
    return posts.length > 0 ? posts : templateSocialFeed(player);
  }
}

// ── Factory ──────────────────────────────────────────────────────

export function makeAiService(env: Env): AiService {
  const provider = (env.AI_PROVIDER ?? 'none').toLowerCase();

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    const model = env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
    return new AnthropicNarrator(env.ANTHROPIC_API_KEY, model);
  }

  if (provider === 'openai' && env.OPENAI_API_KEY) {
    const model = env.AI_MODEL ?? 'gpt-4o-mini';
    const baseUrl = (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    return new OpenAINarrator(env.OPENAI_API_KEY, model, baseUrl);
  }

  return new TemplateNarrator();
}
