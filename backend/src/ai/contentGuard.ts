/**
 * Content guard for CS2 narrative output.
 *
 * quickCheck() is a zero-cost regex filter applied to all generated text before
 * returning it to the caller. It catches internal code variable names that
 * occasionally leak into LLM-generated narrative text.
 */

export interface ContentGuardVerdict {
  ok: boolean;
  issue?: 'mechanic_leak';
  reason?: string;
}

// Internal variable names that must never surface in narrative or social-feed text
const MECHANIC_LEAK_RE =
  /stressChange|fameChange|feel_hot|feel_cold|feelHot|feelCold|疲劳值|压力值|名气值|volatile\.\w+|stressMaxRounds/i;

export function quickCheck(text: string): ContentGuardVerdict {
  if (MECHANIC_LEAK_RE.test(text)) {
    return { ok: false, issue: 'mechanic_leak', reason: '包含游戏内部变量名' };
  }
  return { ok: true };
}
