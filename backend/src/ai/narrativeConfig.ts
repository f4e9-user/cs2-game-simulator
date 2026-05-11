/**
 * Narrative Configuration Schema
 *
 * Defines the TypeScript types for trait narrative rules, event narrative meta,
 * and event-level overrides. Loader/resolver functions are placeholder
 * implementations that will be filled with real logic in T15.
 *
 * @module narrativeConfig
 */

/**
 * 特质叙事规则
 *
 * 定义单个特质的叙事行为模式、禁止误读方向、情绪内核、状态交互规则
 * 以及按事件类型的特殊表现修饰。
 *
 * JSON Schema 参考:
 * {
 *   "traitId": "scapegoat",
 *   "behaviorPatterns": ["习惯性承担责任", "沉默承受批评", "不辩解"],
 *   "forbiddenMisreads": ["不要写成抱怨家人", "不要写成甩锅给队友"],
 *   "emotionalCore": "内疚与自责的循环",
 *   "stateInteractions": { "feel_hot": "想证明自己值得被投资" }
 * }
 */
export interface TraitNarrativeRule {
  /** 对应 traits.ts 中的 id */
  traitId: string;
  /** 正向行为模式描述，如 ["习惯性承担责任", "沉默承受批评", "不辩解"] */
  behaviorPatterns: string[];
  /** 禁止的 LLM 误读方向，如 ["不要写成抱怨家人", "不要写成甩锅给队友"] */
  forbiddenMisreads: string[];
  /** 情绪内核，一句话概括，如 "内疚与自责的循环" */
  emotionalCore: string;
  /** 状态交互规则，key 为状态标识（如 feel_hot/fame_low），value 为叙事提示 */
  stateInteractions: Record<string, string>;
  /**
   * 按事件类型的特殊表现修饰
   * key 为 EventType 字符串值，value 为强调/避免列表
   */
  eventTypeModifiers?: Partial<
    Record<string, { emphasis: string[]; avoid: string[] }>
  >;
}

/**
 * 事件类型默认叙事元数据
 *
 * 为每个 EventType 定义默认的情感基调、玩家立场、冲突类型、
 * 特质反应规则以及叙事约束。
 *
 * JSON Schema 参考:
 * {
 *   "eventType": "bailout",
 *   "emotionTone": "被救济的自尊冲突",
 *   "playerStance": "被动接受关怀",
 *   "conflictType": "经济-自尊",
 *   "traitReactions": { "scapegoat": { "emphasis": [...], "avoid": [...] } },
 *   "narrativeConstraints": ["禁止写成被施舍的愤怒"]
 * }
 */
export interface EventNarrativeMeta {
  /** EventType 的值，如 "bailout"、"life"、"stress" */
  eventType: string;
  /** 情感基调，如 "被救济的自尊冲突"、"日常疲惫"、"竞技紧张" */
  emotionTone: string;
  /** 玩家默认立场，如 "被动接受关怀"、"主动选择"、"被指责方" */
  playerStance: string;
  /** 冲突类型，如 "经济-自尊"、"身体-野心"、"人际-误解" */
  conflictType: string;
  /** 特质默认反应规则 */
  traitReactions: Record<string, { emphasis: string[]; avoid: string[] }>;
  /** 叙事约束列表，如 ["禁止写成被施舍的愤怒"] */
  narrativeConstraints: string[];
}

/**
 * 事件级覆写
 *
 * 继承 EventNarrativeMeta 的字段，增加 eventId 用于精确匹配。
 * 所有覆盖字段均为可选，未指定时 fallback 到事件类型默认值。
 *
 * 覆写优先级: eventId 精确匹配 > eventType 默认 > 空对象 fallback
 */
export interface EventNarrativeOverride {
  /** 事件 id，用于精确匹配覆写 */
  eventId: string;
  /** 覆写情感基调 */
  emotionTone?: string;
  /** 覆写玩家立场 */
  playerStance?: string;
  /** 覆写冲突类型 */
  conflictType?: string;
  /** 覆写特质反应规则 */
  traitReactions?: Record<string, { emphasis: string[]; avoid: string[] }>;
  /** 覆写叙事约束 */
  narrativeConstraints?: string[];
}

/**
 * 特质叙事配置整体类型
 * key 为 traitId，value 为 TraitNarrativeRule
 */
export type TraitNarrativeConfig = Record<string, TraitNarrativeRule>;

/**
 * 事件叙事元数据配置整体类型
 * key 为 EventType 字符串，value 为 EventNarrativeMeta
 */
export type EventNarrativeMetaConfig = Record<string, EventNarrativeMeta>;

// ─── 配置加载器与解析器（占位符实现 ── T15 填充实际逻辑） ────────────────

function createEmptyNarrativeMeta(eventType: string): EventNarrativeMeta {
  return {
    eventType,
    emotionTone: '',
    playerStance: '',
    conflictType: '',
    traitReactions: {},
    narrativeConstraints: [],
  };
}

import traitNarrativeConfig from '../data/config/trait-narrative-config.json';
import eventNarrativeMetaConfig from '../data/config/event-narrative-meta.json';

/**
 * 从 trait-narrative-config.json 加载特质叙事配置
 * 含运行时校验（确保必填字段完整）
 */
export async function loadTraitNarrativeConfig(): Promise<TraitNarrativeConfig> {
  const config = traitNarrativeConfig as TraitNarrativeConfig;

  for (const [traitId, rule] of Object.entries(config)) {
    if (!rule.traitId) throw new Error(`Trait narrative config: missing traitId for key "${traitId}"`);
    // Placeholders have all arrays empty and emotionalCore blank — skip strict validation for them
    const isPlaceholder =
      (!Array.isArray(rule.behaviorPatterns) || rule.behaviorPatterns.length === 0) &&
      (!rule.emotionalCore || rule.emotionalCore === '') &&
      (!Array.isArray(rule.forbiddenMisreads) || rule.forbiddenMisreads.length === 0);
    if (isPlaceholder) continue;
    if (!Array.isArray(rule.behaviorPatterns) || rule.behaviorPatterns.length === 0) {
      throw new Error(`Trait narrative config: missing behaviorPatterns for trait "${traitId}"`);
    }
    if (!rule.emotionalCore || rule.emotionalCore === '') {
      throw new Error(`Trait narrative config: missing emotionalCore for trait "${traitId}"`);
    }
    if (!Array.isArray(rule.forbiddenMisreads) || rule.forbiddenMisreads.length === 0) {
      throw new Error(`Trait narrative config: missing forbiddenMisreads for trait "${traitId}"`);
    }
  }

  return config;
}

/**
 * 从 event-narrative-meta.json 加载事件叙事元数据
 * 含运行时校验（确保覆盖全部实际 EventType）
 */
export async function loadEventNarrativeMeta(): Promise<EventNarrativeMetaConfig> {
  const config = eventNarrativeMetaConfig as EventNarrativeMetaConfig;

  for (const [eventType, meta] of Object.entries(config)) {
    if (!meta.eventType) throw new Error(`Event narrative meta: missing eventType for key "${eventType}"`);
    if (!meta.emotionTone) throw new Error(`Event narrative meta: missing emotionTone for type "${eventType}"`);
    if (!meta.playerStance) throw new Error(`Event narrative meta: missing playerStance for type "${eventType}"`);
    if (!meta.conflictType) throw new Error(`Event narrative meta: missing conflictType for type "${eventType}"`);
    if (!Array.isArray(meta.narrativeConstraints)) {
      throw new Error(`Event narrative meta: missing narrativeConstraints for type "${eventType}"`);
    }
  }

  return config;
}

/**
 * 解析事件叙事元数据
 *
 * 优先级规则:
 * 1. eventId 精确匹配 overrides → 返回 merge 后的元数据
 * 2. 无匹配 overrides → 返回 eventType 默认值
 * 3. 连默认值也没有 → 返回空对象 fallback
 *
 * @param eventType - 事件类型标识
 * @param eventId - 可选，事件唯一 id（用于精确覆写匹配）
 * @param overrides - 可选，事件级覆写列表
 */
export function resolveNarrativeMeta(
  eventType: string,
  eventId?: string,
  overrides?: EventNarrativeOverride[],
  typeDefaults?: EventNarrativeMetaConfig,
): EventNarrativeMeta {
  const defaultMeta = typeDefaults?.[eventType] ?? createEmptyNarrativeMeta(eventType);
  const override = eventId ? overrides?.find((o) => o.eventId === eventId) : undefined;

  if (!override) return defaultMeta;

  return {
    ...defaultMeta,
    emotionTone: override.emotionTone ?? defaultMeta.emotionTone,
    playerStance: override.playerStance ?? defaultMeta.playerStance,
    conflictType: override.conflictType ?? defaultMeta.conflictType,
    traitReactions: override.traitReactions ?? defaultMeta.traitReactions,
    narrativeConstraints: override.narrativeConstraints ?? defaultMeta.narrativeConstraints,
  };
}

/**
 * 根据玩家拥有的 traitId 列表，从配置中提取对应的规则
 *
 * @param traitIds - 玩家拥有的特质 id 列表
 * @param config - 特质叙事配置
 * @returns 匹配的规则列表，缺失的 trait 直接跳过（graceful degradation）
 */
export function buildTraitRulesForPlayer(
  traitIds: string[],
  config: TraitNarrativeConfig,
): TraitNarrativeRule[] {
  return traitIds
    .map((id) => config[id])
    .filter((rule): rule is TraitNarrativeRule => rule !== undefined);
}
