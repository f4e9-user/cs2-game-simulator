import type { Player } from '../../types.js';
import type { OnboardingInsight } from './types.js';

export function buildOnboardingInsight(player: Player): OnboardingInsight | undefined {
  const round = player.round ?? 1;
  if (player.stage !== 'rookie' || round > 5) return undefined;

  if (round <= 1) {
    return {
      mode: 'first_round',
      title: '第一周：先理解 AP',
      message: '每周 AP 决定你能做多少事。不要把所有 AP 都花在高压行动上，早期目标是稳定成长并保留状态。',
      checklist: ['查看本周 AP', '安排 1 个成长行动', '留意压力和疲劳变化'],
      dismissible: true,
    };
  }

  if (round === 2) {
    return {
      mode: 'early_game',
      title: '第二周：训练和恢复要搭配',
      message: '训练、天梯能提升能力，但会增加疲劳和压力。状态太差时，下一次失败会更痛。',
      checklist: ['比较训练收益和疲劳代价', '疲劳高时安排恢复', '不要忽略手感变化'],
      dismissible: true,
    };
  }

  if (round === 3) {
    return {
      mode: 'early_game',
      title: '第三周：开始看赛事窗口',
      message: '新人进入青训通常需要 C/B 级赛事经历和冠军记录。赛事窗口决定你什么时候能证明自己。',
      checklist: ['查看未来赛事', '关注 B 级赛事', '为报名和比赛保留状态'],
      dismissible: true,
    };
  }

  if (round === 4) {
    return {
      mode: 'early_game',
      title: '第四周：管理经济压力',
      message: '资金会影响报名、装备和恢复。赚钱行动能救急，但也会消耗 AP 并制造疲劳。',
      checklist: ['检查当前资金', '避免无计划购物', '必要时用赚钱行动补现金流'],
      dismissible: true,
    };
  }

  return {
    mode: 'stage_intro',
    title: '第五周：准备职业路径选择',
    message: '当你打出足够赛事表现后，就可以把目标转向青训申请和长期战队路线。',
    checklist: ['检查青训申请资格', '补足赛事冠军或 B 级参赛', '关注战队申请机会'],
    dismissible: true,
  };
}
