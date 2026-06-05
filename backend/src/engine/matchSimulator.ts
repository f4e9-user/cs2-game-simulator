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
// Range in practice: early B-tier entry stages to Major finals.

function rosterTeamBonus(player: Player): number {
  if (!player.roster || player.roster.length === 0) return 0;
  const sum = player.roster.reduce((s, tm) => s + tm.stats.agility, 0);
  return Math.floor(sum / 4 / 4);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
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

  // ── 比分（先到 13 局）：强弱差影响分差，爆冷局通常更接近 ─────────────
  const winnerConfidence = won ? winProb : 1 - winProb;
  const confidenceMargin = Math.max(0, winnerConfidence - 0.5);
  const upsetTightener = winnerConfidence < 0.5 ? -2 : 0;
  const margin = clamp(
    Math.round(3 + confidenceMargin * 12 + (rng() - 0.5) * 4 + upsetTightener),
    2,
    11,
  );
  const loserScore = clamp(13 - margin, 2, 11);
  const enemyScore = won ? loserScore : 13;
  const teamScore = won ? 13 : loserScore;
  const totalRounds = teamScore + enemyScore;

  // ── 个人 K / D / A：按每回合参与生成，避免短局被 K/D 下限抬高 ───────
  const aimScore = effectiveAim / 100;
  const decisionScore = decisionBase / 100;
  const stabilityScore = stats.mentality / 20;
  const enemyPressure = enemyAim / 100;
  const lostRoundPressure = enemyScore / totalRounds;

  const kpr = clamp(
    0.58 +
      (aimScore - 0.50) * 0.35 +
      (decisionScore - 0.50) * 0.10 +
      (won ? 0.04 : -0.03) +
      (rng() - 0.5) * 0.16,
    0.25,
    1.10,
  );
  const dpr = clamp(
    0.52 +
      (enemyPressure - 0.50) * 0.22 +
      (lostRoundPressure - 0.50) * 0.35 -
      (stabilityScore - 0.50) * 0.08 +
      (rng() - 0.5) * 0.14,
    0.25,
    1.05,
  );
  const apr = clamp(
    0.12 + decisionScore * 0.12 + (rng() - 0.5) * 0.08,
    0.04,
    0.35,
  );

  const kills = clamp(Math.round(kpr * totalRounds), 0, 40);
  const deaths = clamp(Math.round(dpr * totalRounds), 1, 30);
  const assists = clamp(Math.round(apr * totalRounds), 0, 15);

  // ── 爆头率：先按击杀数生成爆头击杀，再反推比例 ────────────────────
  const hsChance = clamp(
    0.22 + aimScore * 0.28 + feel * 0.025 + (rng() - 0.5) * 0.12,
    0.10,
    0.75,
  );
  const headshotKills = clamp(Math.round(kills * hsChance), 0, kills);
  const headshotRate = kills > 0 ? headshotKills / kills : 0;

  // ── Rating：每回合贡献模型，低击杀小样本不再只因 K/D 高而抬分 ─────
  const actualKpr = kills / totalRounds;
  const actualDpr = deaths / totalRounds;
  const actualApr = assists / totalRounds;
  const decisionMod = (decisionBase - 50) / 100 * 0.12;
  const resultModifier = won ? 0.03 : -0.03;
  const rawRating =
    0.30 +
    actualKpr * 0.95 -
    actualDpr * 0.35 +
    actualApr * 0.25 +
    headshotRate * 0.12 +
    decisionMod +
    resultModifier;
  const rating = round2(clamp(rawRating, 0.50, 2.50));

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
