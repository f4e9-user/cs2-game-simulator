export const ENDING_LABELS: Record<string, string> = {
  voluntary_retirement: '主动结束职业生涯',
  career_ended: '职业生涯提前结束',
  family_crisis_career_ended: '因家庭危机结束职业生涯',
  banned_for_match_fixing: '假赛被查实，永久禁赛',
  banned_for_cheating: '外挂被查实，永久禁赛',
  stress_breakdown: '压力拉满，神经崩断，退赛离场',
  injury_ended_career: '伤病彻底毁了职业生涯',
  champion: '带着冠军戒指退役',
  retired_on_top: '选择在巅峰退役',
  legend: '登上传奇榜，被写进电竞史',
  quiet_exit: '低调退役',
  'free-agent-legend': '草根传奇——从未签约战队，靠开放赛事打出一片天',
  'loyal-veteran': '忠臣老将——数百回合始终如一，与战队共进退',
};

export function formatEnding(ending?: string | null): string {
  return ending ? (ENDING_LABELS[ending] ?? '职业生涯结束') : '未知结局';
}
