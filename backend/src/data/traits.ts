import type { Trait } from '../types.js';

// Traits now both grant stat modifiers and expose tags that shape
// choice.check.traitBonuses / traitPenalties during resolution.
// Positive modifiers become the "floor" of the stat allocator;
// negative modifiers are shown in the allocator as a visible penalty
// that the player can compensate for with their 10-point pool.
export const TRAITS: Trait[] = [
  {
    id: 'aim-god',
    name: '枪法天才',
    description:
      '第一次摸鼠标那天，队友就以为他开了挂。对枪时眼睛比手快，定位像磁铁一样精准。不是练出来的——是天生的。',
    modifiers: { agility: 2 },
    tags: ['aimer', 'mechanical'],
  },
  {
    id: 'tactical-mind',
    name: '战术大脑',
    description:
      '别人在看集锦，他在看 demo。对手的经济、站位、习惯——每一帧都在他脑子里自动拆解。队友还没开口，他已经知道这局该怎么赢。',
    modifiers: { intelligence: 2 },
    tags: ['igl', 'tactical'],
  },
  {
    id: 'ice-cold',
    name: '冰冷心脏',
    description:
      '14:15，残局 1v3。观众席在吼，队友屏住呼吸，他的手稳得像刚开局。压力对他来说不是负担——是燃料。赢下这种局后他只是站起来喝了口水。',
    modifiers: { mentality: 2 },
    tags: ['clutch', 'steady'],
  },
  {
    id: 'grinder',
    name: '训练狂',
    description:
      '训练服第一个在线，最后一个离线。每天 500 个 bot 击杀是底线，不是目标。别人问他秘诀，他说"再练一会儿"。身体偶尔抗议，但他从不回应。',
    modifiers: { experience: 1, agility: 1, constitution: -1 },
    tags: ['grinder', 'steady'],
  },
  {
    id: 'streamer-charm',
    name: '镜头感',
    description:
      '镜头一亮，他就像另一个人——松弛、有趣、句句有梗。弹幕刷得越快，他打得越花。赞助商喜欢他，粉丝更喜欢他。休息室里他也是那个让所有人笑出声的人。',
    modifiers: { mentality: 1 },
    tags: ['streamer', 'media'],
  },
  {
    id: 'support-soul',
    name: '团队型选手',
    description:
      '他不在乎 MVP。他记得队友每个位置的偏好，知道谁需要鼓励、谁需要被骂醒。拉枪线、丢道具、报残血——这些不会上集锦的事，他做了一万遍。',
    modifiers: { mentality: 1, intelligence: 1 },
    tags: ['support', 'steady'],
  },
  {
    id: 'awper-instinct',
    name: 'AWP 嗅觉',
    description:
      '有些角度他甚至说不清为什么架那里——但对手就是会从那里出来。时机、距离、预瞄，全凭一种说不清的直觉。开镜的瞬间他已经知道这一枪会中。',
    modifiers: { agility: 1, intelligence: 1 },
    tags: ['awper', 'mechanical'],
  },
  {
    id: 'scene-kid',
    name: '网吧少年',
    description:
      '网吧二楼的烟味泡面味是他最熟悉的环境。没有教练、没有战术板、没有人体工学椅——只有一台破电脑和不服输的狠劲。从局域网赛到线上天梯，他靠野路子杀出了一条路。',
    modifiers: { mentality: 2, experience: 1, constitution: 1 },
    tags: ['streetwise', 'grinder'],
  },
  {
    id: 'fragile-star',
    name: '玻璃心',
    description:
      '枪法顶尖，心态谷底。赢的时候他是神，输的时候他是第一个崩溃的人。赛后他会反复刷评论区，然后失眠到凌晨。队友知道不能在他耳边叹气——他真的会听进去。',
    modifiers: { agility: 2, mentality: -2 },
    tags: ['mechanical', 'media', 'fragile'],
  },
  {
    id: 'ranked-warrior',
    name: '天梯之王',
    description:
      '天梯排名是他唯一的简历。一个人杀穿五个人是家常便饭，但战术配合在他眼里是"耽误我发挥"。路人局他是神，正式比赛教练需要反复提醒他"你不是一个人在打"。',
    modifiers: { agility: 1, experience: 2, intelligence: -1 },
    tags: ['solo', 'mechanical'],
  },
  {
    id: 'gambler',
    name: '赌徒体质',
    description:
      '他说"不下注的比赛没有灵魂"。不仅是皮肤博彩——生活里每一个决定他都愿意加注。赢的时候觉得自己天下无敌，输了说"下次一把回来"。那把一直没来。',
    modifiers: { agility: 1 },
    tags: ['risky', 'gambler'],
  },
  {
    id: 'hothead',
    name: '易怒',
    description:
      '队友的失误、裁判的判罚、弹幕的嘲讽——任何一点火星都能点燃他。但奇怪的是，愤怒中的他枪法反而更准。问题是，炸完之后谁来收拾残局。',
    modifiers: { agility: 2, mentality: -2 },
    tags: ['aggressive', 'volatile'],
  },
  {
    id: 'arrogant',
    name: '自负',
    description:
      '"输了是因为队友太菜"——他真的这么认为。每次输掉后他做的第一件事不是看自己的失误，而是在想换哪个队友能赢。教练找他复盘？浪费时间。他已经是最好的了。',
    modifiers: { agility: 1, mentality: 1, intelligence: -2 },
    tags: ['solo', 'ego'],
  },
  {
    id: 'introvert',
    name: '社恐',
    description:
      '采访间的灯光比任何残局都让他紧张。新队友打招呼时他盯着自己的键盘。但一个人待着的时候，他能把下个对手的 demo 研究到每一回合。安静的人，脑子里从来不安静。',
    modifiers: { intelligence: 2, mentality: -1 },
    tags: ['shy', 'anti-media'],
  },
  {
    id: 'addicted',
    name: '沉迷型',
    description:
      '一天 12 小时，一周 7 天。吃饭在电脑前，睡觉在电脑前，活着在电脑前。他的天梯排名是最好的，但他的生活——如果那还能叫生活的话——是一团废墟。他自己知道，但关不掉。',
    modifiers: { experience: 2, mentality: -1, constitution: -1 },
    tags: ['grinder', 'obsessed'],
  },
  {
    id: 'flashy',
    name: '花架子',
    description:
      '360 度跳狙、盲狙甩枪、刀杀集锦——他的操作足够填满十个精彩镜头合集。但教练翻看他的胜率时皱起了眉头。华丽和有用是两回事，而他还没搞明白这个区别。',
    modifiers: { agility: 1, experience: -1 },
    tags: ['media', 'flashy', 'inconsistent'],
  },
  {
    id: 'impatient',
    name: '急性子',
    description:
      'ECO 局？不等。默认架枪？不存在的。他需要肾上腺素，需要发生点什么——任何事都行。所以他一听到脚步就拉出去。有时候这是天才的先手，有时候是愚蠢的送头。',
    modifiers: { agility: 1, intelligence: -1 },
    tags: ['impulsive'],
  },
  {
    id: 'procrastinator',
    name: '拖延症',
    description:
      '"明天一定复盘。"——这是他对自己说的第 17 遍。训练计划写得很完美，执行记录一片空白。但奇怪的是，截止日期的前一晚他总能奇迹般地完成一切。不是最好的方式，但暂时还没出大事。',
    modifiers: { intelligence: 1, experience: -2 },
    tags: ['lazy'],
  },
  {
    id: 'glass-wrist',
    name: '玻璃腕',
    description:
      '他的枪法足够打职业，但他的手腕不同意。每次高强度训练后，右手都在隐隐作痛。医生说的"休息"在他耳中翻译成"落后"。他在跟自己的身体打一场注定会输的持久战。',
    modifiers: { agility: 2, mentality: -1, constitution: -2 },
    tags: ['fragile'],
  },
  {
    id: 'scapegoat',
    name: '背锅侠',
    description:
      '输了比赛，弹幕第一个刷的是他的名字。他知道有些锅不是他的，但他不辩解——辩解只会让事情更糟。队友私下感谢他，粉丝公开骂他。他已经习惯了在这种夹缝里站着。',
    modifiers: { mentality: 2 },
    tags: ['support', 'selfless'],
  },
  {
    id: 'iron-body',
    name: '铁打身板',
    description:
      '篮球、足球、游泳——在摸到鼠标之前，他已经把身体练成了铁板。别人在抱怨手腕酸、腰疼、颈椎不适的时候，他刚打完 12 小时天梯又去跑了 5 公里。伤病名单上永远不会出现他的名字。',
    modifiers: { constitution: 3 },
    tags: ['athletic', 'steady'],
  },
  {
    id: 'night-owl',
    name: '夜猫体质',
    description:
      '下午三点的训练赛他困得像梦游。但一到凌晨，他的瞳孔开始发光。深夜服务器上只剩下他一个人，准星却比白天任何时候都稳。他知道这不健康，但凌晨三点是他的时区。',
    modifiers: { experience: 1, constitution: -2, mentality: 1 },
    tags: ['grinder', 'obsessed'],
  },
];

export function getTrait(id: string): Trait | undefined {
  return TRAITS.find((t) => t.id === id);
}
