import {
  FAME_MAX,
  FAME_MIN,
  FATIGUE_MAX,
  FATIGUE_MIN,
  FEEL_MAX,
  FEEL_MIN,
  STRESS_MAX,
  STRESS_MIN,
  TILT_MAX,
  TILT_MIN,
} from './constants.js';

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clampStress(v: number): number {
  return Math.max(STRESS_MIN, Math.min(STRESS_MAX, Math.round(v)));
}

export function clampFame(v: number): number {
  return Math.max(FAME_MIN, Math.min(FAME_MAX, Math.round(v)));
}

export function clampFeel(v: number, feelMax = FEEL_MAX): number {
  return Math.max(FEEL_MIN, Math.min(feelMax, Math.round(v * 2) / 2));
}

export function clampTilt(v: number): number {
  return Math.max(TILT_MIN, Math.min(TILT_MAX, Math.round(v)));
}

export function clampFatigue(v: number): number {
  return Math.max(FATIGUE_MIN, Math.min(FATIGUE_MAX, Math.round(v)));
}

export function clampNumber(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function clampTeamTrust(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs));
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
