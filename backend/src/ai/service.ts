import type { Background, Env, LeaderboardTeam, Player, RoundResult, Trait } from '../types.js';
import {
  buildIntroPrompt,
  buildNarrativePrompt,
  buildSummaryPrompt,
  type NarrativePromptInput,
} from './prompts.js';

export interface AiService {
  readonly active: boolean;
  narrate(input: NarrativePromptInput): Promise<string>;
  summarize(player: Player, history: RoundResult[], ending?: string): Promise<string>;
  intro(player: Player, traits: Trait[], background: Background): Promise<string>;
  simulateLeaderboardTick?(
    teams: LeaderboardTeam[],
    player: Player,
  ): Promise<LeaderboardTeam[]>;
}

const NARRATIVE_SYSTEM_PROMPT =
  '你是一个 CS2 电竞小说的叙事引擎。只输出润色后的正文，不要解释，不要加引号。';

const SUMMARY_SYSTEM_PROMPT =
  '你是一个 CS2 电竞生涯传记作者。只输出小结正文，不要标题，不要解释。';

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
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
}

// ── Anthropic ────────────────────────────────────────────────────

class AnthropicNarrator implements AiService {
  readonly active = true;
  constructor(private apiKey: string, private model: string) {}

  async narrate(input: NarrativePromptInput): Promise<string> {
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
          max_tokens: 200,
          system: NARRATIVE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildNarrativePrompt(input) }],
        }),
      });
      if (!res.ok) return input.baseNarrative;
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = data.content?.find((c) => c.type === 'text')?.text?.trim();
      return text && text.length > 0 ? text : input.baseNarrative;
    } catch {
      return input.baseNarrative;
    }
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
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
          max_tokens: 300,
          system: SUMMARY_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildSummaryPrompt(player, history, ending) }],
        }),
      });
      if (!res.ok) return '';
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      return data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    } catch {
      return '';
    }
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
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
          max_tokens: 300,
          system: '你是一部 CS2 电竞生涯小说的开篇叙事者。只输出故事正文，不要标题，不要引号。',
          messages: [{ role: 'user', content: buildIntroPrompt(player, traits, background) }],
        }),
      });
      if (!res.ok) return '';
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      return data.content?.find((c) => c.type === 'text')?.text?.trim() ?? '';
    } catch {
      return '';
    }
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
  ): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as OpenAIChatResponse;
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  async narrate(input: NarrativePromptInput): Promise<string> {
    const text = await this.chat(
      NARRATIVE_SYSTEM_PROMPT,
      buildNarrativePrompt(input),
      200,
    );
    return text && text.length > 0 ? text : input.baseNarrative;
  }

  async summarize(player: Player, history: RoundResult[], ending?: string): Promise<string> {
    return (
      (await this.chat(
        SUMMARY_SYSTEM_PROMPT,
        buildSummaryPrompt(player, history, ending),
        300,
      )) ?? ''
    );
  }

  async intro(player: Player, traits: Trait[], background: Background): Promise<string> {
    return (
      (await this.chat(
        '你是一部 CS2 电竞生涯小说的开篇叙事者。只输出故事正文，不要标题，不要引号。',
        buildIntroPrompt(player, traits, background),
        300,
      )) ?? ''
    );
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
