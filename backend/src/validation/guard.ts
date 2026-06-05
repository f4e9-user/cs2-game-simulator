import type { ChoiceDef, EventDef } from '../types.js';

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((i) => isString(i));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

const ALLOWED_CHECK_STATS = new Set(['intelligence', 'agility', 'experience', 'money', 'mentality', 'constitution']);
const ALLOWED_STAT_CHANGES = new Set(['intelligence', 'agility', 'experience', 'mentality', 'constitution']);
const ALLOWED_AI_EVENT_TYPES = new Set(['life', 'media', 'stress', 'rival', 'team']);

function isValidStatChanges(v: unknown): boolean {
  if (!isObject(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (!ALLOWED_STAT_CHANGES.has(k)) return false;
    if (!isNumber(val) || val < -3 || val > 3) return false;
  }
  return true;
}

function isValidChoice(v: unknown): v is ChoiceDef {
  if (!isObject(v)) return false;
  const c = v as Record<string, unknown>;
  if (!isString(c.id) || c.id.length === 0) return false;
  if (!isString(c.label) || c.label.length === 0 || c.label.length > 30) return false;
  if (c.description !== undefined && (!isString(c.description) || c.description.length > 100)) return false;

  if (!isObject(c.check)) return false;
  const chk = c.check as Record<string, unknown>;
  if (!isString(chk.primary) || !ALLOWED_CHECK_STATS.has(chk.primary)) return false;
  if (chk.secondary !== undefined && (!isString(chk.secondary) || !ALLOWED_CHECK_STATS.has(chk.secondary))) return false;
  if (!isNumber(chk.dc) || chk.dc < 0 || chk.dc > 20) return false;
  if (chk.traitBonuses !== undefined && !isObject(chk.traitBonuses)) return false;

  const outcomeFields = ['success', 'failure'] as const;
  for (const f of outcomeFields) {
    const out = c[f];
    if (!isObject(out)) return false;
    const o = out as Record<string, unknown>;
    if (!isString(o.narrative) || o.narrative.length < 5 || o.narrative.length > 200) return false;
    if (o.statChanges !== undefined && !isValidStatChanges(o.statChanges)) return false;
    if (o.stressDelta !== undefined && (!isNumber(o.stressDelta) || o.stressDelta < -20 || o.stressDelta > 20)) return false;
    if (o.fatigueDelta !== undefined && (!isNumber(o.fatigueDelta) || o.fatigueDelta < -50 || o.fatigueDelta > 50)) return false;
    if (o.feelDelta !== undefined && (!isNumber(o.feelDelta) || o.feelDelta < -3 || o.feelDelta > 3)) return false;
    if (o.tiltDelta !== undefined && (!isNumber(o.tiltDelta) || o.tiltDelta < -3 || o.tiltDelta > 3)) return false;
    if (o.fameDelta !== undefined && (!isNumber(o.fameDelta) || o.fameDelta < -20 || o.fameDelta > 20)) return false;
    if (o.moneyDelta !== undefined && (!isNumber(o.moneyDelta) || o.moneyDelta < -20 || o.moneyDelta > 20)) return false;
  }

  return true;
}

const ALLOWED_STAGES = new Set(['rookie', 'youth', 'second', 'pro', 'retired']);

export function isValidAiEvent(v: unknown): v is EventDef {
  if (!isObject(v)) return false;
  const e = v as Record<string, unknown>;

  if (!isString(e.id) || !/^ai-[a-z0-9-]+$/.test(e.id)) return false;
  if (!isString(e.type) || !ALLOWED_AI_EVENT_TYPES.has(e.type)) return false;
  if (!isString(e.title) || e.title.length === 0 || e.title.length > 40) return false;
  if (!isString(e.narrative) || e.narrative.length < 10 || e.narrative.length > 300) return false;

  if (!isStringArray(e.stages) || e.stages.length === 0) return false;
  if (!e.stages.every((s) => ALLOWED_STAGES.has(s))) return false;

  if (!isNumber(e.difficulty) || e.difficulty < 0 || e.difficulty > 10) return false;

  if (e.weight !== undefined && (!isNumber(e.weight) || e.weight <= 0)) return false;

  if (e.requireTags !== undefined && !isStringArray(e.requireTags)) return false;
  if (e.forbidTags !== undefined && !isStringArray(e.forbidTags)) return false;

  if (!Array.isArray(e.choices) || e.choices.length < 2 || e.choices.length > 4) return false;
  if (!e.choices.every(isValidChoice)) return false;

  return true;
}

export function validateAiEvents(raw: unknown[]): { valid: EventDef[]; invalid: unknown[] } {
  const valid: EventDef[] = [];
  const invalid: unknown[] = [];
  for (const item of raw) {
    if (isValidAiEvent(item)) valid.push(item);
    else invalid.push(item);
  }
  return { valid, invalid };
}
