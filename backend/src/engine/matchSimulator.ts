import type { ClubTier, Player } from '../types.js';
import { calcSynergyBonus, calcTrustModifier } from './synergy.js';

export interface MatchStats {
  kills: number;
  deaths: number;
  assists: number;
  headshotRate: number; // 0.0 – 1.0
  rating: number;       // HLTV-style, e.g. 1.23
  teamScore: number;    // player side rounds won
  enemyScore: number;   // enemy side rounds won
}

export interface MatchSimResult extends MatchStats {
  won: boolean;
  summary: string;
  feelDelta: number;
  tiltDelta: number;
  fatigueDelta: number;
  // For synthetic ResolveResult
  winProb: number;
}

// effectiveDifficulty = tournament.baseDifficulty + stage.difficultyBonus
// Range in practice: 0 (netcafe entry) to 7 (major final)

function rosterTeamBonus(player: Player): number {
  if (!player.roster || player.roster.length === 0) return 0;
  const sum = player.roster.reduce((s, tm) => s + tm.stats.agility, 0);
  return Math.floor(sum / 4 / 4);
}

export function simulateMatch(
  player: Player,
  effectiveDifficulty: number,
  rng: () => number,
): MatchSimResult {
  const { stats, volatile } = player;
  const { feel, tilt, fatigue } = volatile;

  // ── 派生 AIM ──────────────────────────────────────────────────
  const aimBase = (stats.agility * 0.7 + stats.experience * 0.3) / 20 * 100;
  const decisionBase = (stats.intelligence * 0.7 + stats.experience * 0.3) / 20 * 100;

  const feelEffect = feel * 3;
  const fatigueDebuff = Math.max(0, (fatigue - 60) * 0.2);
  const tiltDebuff = tilt * 3;
  const rawTeamBonus = rosterTeamBonus(player);
  const synergyBonus = player.roster ? calcSynergyBonus(player, player.roster) : 0;
  const trustModifier = calcTrustModifier(player.teamTrust ?? 50);
  const teamBonus = rawTeamBonus + synergyBonus + trustModifier;
  const effectiveAim = Math.max(5, Math.min(99,
    aimBase + feelEffect - fatigueDebuff - tiltDebuff + teamBonus,
  ));

  // ── 对手强度 ──────────────────────────────────────────────────
  const enemyAim = Math.max(20, Math.min(90, 25 + effectiveDifficulty * 8));

  // ── 胜率 ──────────────────────────────────────────────────────
  const aimAdv = effectiveAim - enemyAim;
  const stabilityBonus = (stats.mentality / 20 - 0.5) * 0.08;
  const winProb = Math.max(0.05, Math.min(0.95,
    0.5 + aimAdv / 60 + stabilityBonus,
  ));
  const won = rng() < winProb;

  // ── 比分（先到 13 局，最多 24 局）────────────────────────────
  const enemyScore = won ? Math.max(2, Math.round(rng() * 12)) : 13;
  const teamScore = won ? 13 : Math.max(2, Math.round(rng() * 12));
  const totalRounds = teamScore + enemyScore;

  // ── 个人 K / D / A ───────────────────────────────────────────
  const noise = () => 0.8 + rng() * 0.4;
  const killRate = 0.28 + (effectiveAim / 100) * 0.42;
  const deathRate = 0.20 + (enemyAim / 100) * 0.38;
  const kills = Math.max(5, Math.min(40, Math.round(killRate * totalRounds * noise())));
  const deaths = Math.max(3, Math.min(30, Math.round(deathRate * totalRounds * noise())));
  const assists = Math.max(0, Math.min(15, Math.round(kills * 0.2 + rng() * 3)));

  // ── 爆头率（与敏捷 + 手感相关）──────────────────────────────
  const baseHSR = 0.15 + (stats.agility / 20) * 0.35;
  const headshotRate = Math.max(0.05, Math.min(0.80,
    baseHSR + feel * 0.025 + (rng() - 0.5) * 0.12,
  ));

  // ── Rating（近似 HLTV 2.0）──────────────────────────────────
  const kd = kills / deaths;
  const decisionMod = (decisionBase - 50) / 100 * 0.12;
  const rawRating = kd * 0.60 + headshotRate * 0.35 + decisionMod + 0.20;
  const rating = Math.round(Math.max(0.50, Math.min(2.50, rawRating)) * 100) / 100;

  // ── 状态变化 ─────────────────────────────────────────────────
  const ratingVsAvg = rating - 1.0;
  // feelDelta: 0.5 步进，由表现驱动
  const feelDelta = Math.max(-2, Math.min(2, Math.round(ratingVsAvg * 3 * 2) / 2));
  // fatigueDelta: 比赛消耗，20–32
  const fatigueDelta = Math.round(20 + (totalRounds - 16) * 1.5);
  // tiltDelta: 爆冷输球 → 心态波动
  let tiltDelta = 0;
  if (!won && winProb > 0.65) tiltDelta += 1;
  if (!won && winProb > 0.80) tiltDelta += 1;
  if (won && winProb < 0.35) tiltDelta -= 1; // 逆转胜 → 反而平稳

  const summary = buildSummary(
    { kills, deaths, assists, headshotRate, rating, teamScore, enemyScore },
    player,
    won,
    fatigueDelta,
    winProb,
  );

  return {
    won,
    kills,
    deaths,
    assists,
    headshotRate,
    rating,
    teamScore,
    enemyScore,
    summary,
    feelDelta,
    tiltDelta,
    fatigueDelta,
    winProb,
  };
}

function buildSummary(
  stats: MatchStats,
  player: Player,
  won: boolean,
  fatigueDelta: number,
  winProb: number,
): string {
  const { kills, deaths, assists, headshotRate, rating, teamScore, enemyScore } = stats;
  const { feel, tilt, fatigue } = player.volatile;
  const hsrPct = Math.round(headshotRate * 100);
  const scoreStr = `${teamScore}:${enemyScore}`;
  const parts: string[] = [];

  // 1. 赛前状态
  if (feel >= 2) {
    parts.push('手感极其火爆，准星仿佛有自己的意志');
  } else if (feel >= 1) {
    parts.push('状态不错，手感跟上了');
  } else if (feel <= -2) {
    parts.push('手感冰冷，对枪总是慢半拍');
  } else if (feel <= -1) {
    parts.push('状态有些偏差');
  }

  if (tilt >= 2) {
    parts.push('心态有些失稳，关键局出现了不该有的失误');
  }

  if (fatigue >= 80) {
    parts.push('体能严重透支，后程已是强撑');
  } else if (fatigue >= 65) {
    parts.push('中后程明显感到疲惫');
  }

  // 2. 个人表现
  if (rating >= 1.5) {
    parts.push(
      `全场统治级发挥，${kills} 杀 ${deaths} 死 ${assists} 助攻，爆头率 ${hsrPct}%`,
    );
  } else if (rating >= 1.2) {
    parts.push(`出色发挥，${kills} 杀 ${deaths} 死，爆头率 ${hsrPct}%`);
  } else if (rating >= 1.0) {
    parts.push(`稳定输出，${kills} 杀 ${deaths} 死 ${assists} 助攻`);
  } else if (rating >= 0.85) {
    parts.push(`发挥平平，${kills} 杀 ${deaths} 死`);
  } else {
    parts.push(`状态低迷，仅 ${kills} 杀 ${deaths} 死，表现令人失望`);
  }

  // 3. 疲劳警报（如果影响后程）
  if (fatigueDelta >= 28 && fatigue < 60) {
    parts.push('高强度拉锯消耗了大量体力');
  }

  // 4. 结果叙述
  if (won) {
    if (rating >= 1.3) {
      parts.push(
        `队伍以 ${scoreStr} 取胜，你的 Rating ${rating.toFixed(2)} 是关键支柱`,
      );
    } else if (winProb < 0.40) {
      parts.push(`逆境翻盘，以 ${scoreStr} 险胜，Rating ${rating.toFixed(2)}`);
    } else {
      parts.push(`队伍以 ${scoreStr} 取胜，Rating ${rating.toFixed(2)}`);
    }
  } else {
    if (rating >= 1.1) {
      parts.push(
        `虽以 ${scoreStr} 落败，你个人 Rating ${rating.toFixed(2)} 是队内担当`,
      );
    } else if (winProb > 0.70) {
      parts.push(
        `爆冷告负，以 ${scoreStr} 遗憾出局，Rating ${rating.toFixed(2)}`,
      );
    } else {
      parts.push(`最终以 ${scoreStr} 告负，Rating ${rating.toFixed(2)}`);
    }
  }

  return parts.join('，') + '。';
}
