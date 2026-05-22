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

function isValidStatChanges(v: unknown): boolean {
  if (!isObject(v)) return false;
  const allowed = new Set(['intelligence', 'agility', 'experience', 'money', 'mentality', 'constitution']);
  for (const [k, val] of Object.entries(v)) {
    if (!allowed.has(k)) return false;
    if (!isNumber(val) || val < -5 || val > 5) return false;
  }
  return true;
}

function isValidChoice(v: unknown): v is ChoiceDef {
  if (!isObject(v)) return false;
  const c = v as Record<string, unknown>;
  if (!isString(c.id) || c.id.length === 0) return false;
  if (!isString(c.label) || c.label.length === 0 || c.label.length > 30) return false;
  if (c.description !== undefined && (!isString(c.description) || c.description.length > 100)) return false;

  if (c.check !== undefined) {
    const chk = c.check;
    if (!isObject(chk)) return false;
    if (!isString(chk.primary)) return false;
    if (!isNumber(chk.dc) || chk.dc < 0 || chk.dc > 20) return false;
    if (chk.traitBonuses !== undefined && !isObject(chk.traitBonuses)) return false;
  }

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
  }

  return true;
}

const ALLOWED_EVENT_TYPES = new Set([
  'training', 'ranked', 'team', 'tryout', 'match',
  'media', 'life', 'bailout', 'betting', 'cheat',
  'rest', 'stress', 'rival', 'broadcast', 'daily',
  'chains', 'skins', 'agent',
]);

const ALLOWED_STAGES = new Set(['rookie', 'youth', 'second', 'pro', 'retired']);

export function isValidAiEvent(v: unknown): v is EventDef {
  if (!isObject(v)) return false;
  const e = v as Record<string, unknown>;

  if (!isString(e.id) || !e.id.startsWith('ai-')) return false;
  if (!isString(e.type) || !ALLOWED_EVENT_TYPES.has(e.type)) return false;
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
