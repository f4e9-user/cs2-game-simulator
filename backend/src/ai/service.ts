import type { Env, LeaderboardTeam, Player } from '../types.js';
import {
  buildNarrativePrompt,
  type NarrativePromptInput,
} from './prompts.js';

export interface AiService {
  // True when a real model is wired up (not template fallback).
  readonly active: boolean;
  // Polish narrative — returns base text on any failure.
  narrate(input: NarrativePromptInput): Promise<string>;
  // Future hook: simulate non-player team point gains for the week. The
  // template implementation just nudges scores randomly; LLM impl can read
  // recent results and produce more interesting deltas.
  simulateLeaderboardTick?(
    teams: LeaderboardTeam[],
    player: Player,
  ): Promise<LeaderboardTeam[]>;
}

class TemplateNarrator implements AiService {
  readonly active = false;
  async narrate(input: NarrativePromptInput): Promise<string> {
    return input.baseNarrative;
  }
}

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
          messages: [
            { role: 'user', content: buildNarrativePrompt(input) },
          ],
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
}

export function makeAiService(env: Env): AiService {
  const provider = (env.AI_PROVIDER ?? 'none').toLowerCase();
  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    const model = env.AI_MODEL ?? 'claude-haiku-4-5-20251001';
    return new AnthropicNarrator(env.ANTHROPIC_API_KEY, model);
  }
  return new TemplateNarrator();
}
