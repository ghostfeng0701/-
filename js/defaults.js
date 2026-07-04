/**
 * 日积跬步 - 默认习惯配置
 * 预置四种必须习惯 + 可选习惯模板
 */

/**
 * 默认必须做的四个习惯
 */
const DEFAULT_HABITS = [
  {
    name: '叩齿',
    category: 'default',
    type: 'count',
    defaultCount: 100,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['07:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 300 },
    color: '#F59E0B',
    icon: '🦷',
    order: 0,
  },
  {
    name: '跪坐',
    category: 'default',
    type: 'duration',
    defaultCount: 0,
    defaultDuration: 15,
    durationTimes: 1,
    reminderTimes: ['07:30'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 250 },
    color: '#60A5FA',
    icon: '🧘',
    order: 1,
  },
  {
    name: '抖功',
    category: 'default',
    type: 'duration',
    defaultCount: 0,
    defaultDuration: 5,
    durationTimes: 1,
    reminderTimes: ['08:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 300 },
    color: '#4ADE80',
    icon: '🦶',
    order: 2,
  },
  {
    name: '握固',
    category: 'default',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['21:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 300 },
    color: '#A78BFA',
    icon: '✊',
    order: 3,
  },
];

/**
 * 可选习惯模板
 */
const OPTIONAL_HABIT_TEMPLATES = [
  {
    name: '早起',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['05:30'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 300 },
    color: '#FB923C',
    icon: '🌅',
  },
  {
    name: '早睡',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['21:30'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 300 },
    color: '#818CF8',
    icon: '🌙',
  },
  {
    name: '子时功',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['23:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 200 },
    color: '#C084FC',
    icon: '🧘‍♂️',
  },
  {
    name: '睡功',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['22:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 200 },
    color: '#6EE7B7',
    icon: '😴',
  },
  {
    name: '桩功',
    category: 'optional',
    type: 'duration',
    defaultCount: 0,
    defaultDuration: 10,
    durationTimes: 1,
    reminderTimes: ['06:30'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 200 },
    color: '#F472B6',
    icon: '🧍',
  },
  {
    name: '天星每日学',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['09:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 250 },
    color: '#FBBF24',
    icon: '⭐',
  },
  {
    name: '小解抓地',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: [],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 300 },
    color: '#38BDF8',
    icon: '👣',
  },
  {
    name: '只管打坐',
    category: 'optional',
    type: 'duration',
    defaultCount: 0,
    defaultDuration: 20,
    durationTimes: 1,
    reminderTimes: ['12:00'],
    status: 'active',
    annualTarget: { enabled: true, type: 'days', target: 200 },
    color: '#A3E635',
    icon: '🧎',
  },
  {
    name: '朝暮鼓励',
    category: 'optional',
    type: 'boolean',
    defaultCount: 0,
    defaultDuration: 0,
    durationTimes: 1,
    reminderTimes: ['06:00', '20:00'],
    status: 'active',
    annualTarget: { enabled: false, type: 'days', target: 0 },
    color: '#F97316',
    icon: '💪',
  },
];

/**
 * 获取习惯的显示文本
 * @param {Object} habit
 * @returns {string}
 */
function getHabitDisplayInfo(habit) {
  switch (habit.type) {
    case 'count':
      return `${habit.defaultCount}次`;
    case 'duration':
      if (habit.durationTimes > 1) {
        return `${habit.defaultDuration}分钟 × ${habit.durationTimes}次`;
      }
      return `${habit.defaultDuration}分钟`;
    case 'boolean':
      return '完成/未完成';
    default:
      return '';
  }
}

/**
 * 鼓励语句库（通用）
 */
const ENCOURAGEMENTS = [
  '不积跬步，无以至千里 🌟',
  '日日行，不怕千万里 🚶',
  '水滴石穿，非一日之功 💧',
  '每一步都算数 ✨',
  '持续的力量最强大 💪',
  '你已经在变好的路上 🌱',
  '每一天的坚持都是胜利 🏆',
  '慢慢来，比较快 🐢',
  '安静的力量，源自每日修行 🧘',
  '今天的你，比昨天更强 🔥',
];

/**
 * 道家经典语句库
 * 每日随机从以下经典摘取积极向上的句子：
 * 《道德经》《太上感应篇》《太上老君说常清静经》
 * 《黄帝阴符经》《太乙金华宗旨》《庄子（南华经）》
 * 《列子（冲虚真经）》《文子（通玄真经）》《洞灵真经（亢仓子）》
 */
const TAOIST_QUOTES = [
  // === 道德经 ===
  { text: '合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下。', source: '《道德经》第六十四章' },
  { text: '上善若水，水善利万物而不争。', source: '《道德经》第八章' },
  { text: '知人者智，自知者明。胜人者有力，自胜者强。', source: '《道德经》第三十三章' },
  { text: '天下难事必作于易，天下大事必作于细。', source: '《道德经》第六十三章' },
  { text: '慎终如始，则无败事。', source: '《道德经》第六十四章' },
  { text: '大器晚成，大音希声，大象无形。', source: '《道德经》第四十一章' },
  { text: '为学日益，为道日损。损之又损，以至于无为。', source: '《道德经》第四十八章' },
  { text: '知足不辱，知止不殆，可以长久。', source: '《道德经》第四十四章' },
  { text: '善行无辙迹，善言无瑕谪。', source: '《道德经》第二十七章' },
  { text: '柔弱胜刚强。', source: '《道德经》第三十六章' },
  { text: '大直若屈，大巧若拙，大辩若讷。', source: '《道德经》第四十五章' },
  { text: '静胜躁，寒胜热，清静为天下正。', source: '《道德经》第四十五章' },
  { text: '既以为人己愈有，既以与人己愈多。', source: '《道德经》第八十一章' },
  { text: '信言不美，美言不信。善者不辩，辩者不善。', source: '《道德经》第八十一章' },
  { text: '知者不博，博者不知。', source: '《道德经》第八十一章' },
  { text: '天之道，利而不害；圣人之道，为而不争。', source: '《道德经》第八十一章' },
  { text: '祸兮福之所倚，福兮祸之所伏。', source: '《道德经》第五十八章' },
  { text: '治人事天莫若啬。夫唯啬，是谓早服。', source: '《道德经》第五十九章' },
  { text: '是以圣人终不为大，故能成其大。', source: '《道德经》第六十三章' },
  { text: '江海所以能为百谷王者，以其善下之。', source: '《道德经》第六十六章' },

  // === 太上感应篇 ===
  { text: '祸福无门，惟人自召；善恶之报，如影随形。', source: '《太上感应篇》' },
  { text: '是道则进，非道则退。', source: '《太上感应篇》' },
  { text: '不履邪径，不欺暗室。', source: '《太上感应篇》' },
  { text: '积德累功，慈心于物。', source: '《太上感应篇》' },
  { text: '忠孝友悌，正己化人。', source: '《太上感应篇》' },
  { text: '矜孤恤寡，敬老怀幼。', source: '《太上感应篇》' },
  { text: '宜悯人之凶，乐人之善。', source: '《太上感应篇》' },
  { text: '济人之急，救人之危。', source: '《太上感应篇》' },
  { text: '见人之得，如己之得；见人之失，如己之失。', source: '《太上感应篇》' },
  { text: '不彰人短，不炫己长。', source: '《太上感应篇》' },
  { text: '遏恶扬善，推多取少。', source: '《太上感应篇》' },
  { text: '受辱不怨，受宠若惊。', source: '《太上感应篇》' },
  { text: '施恩不求报，与人不追悔。', source: '《太上感应篇》' },
  { text: '故吉人语善、视善、行善，一日有三善，三年天必降之福。', source: '《太上感应篇》' },
  { text: '夫心起于善，善虽未为，而吉神已随之。', source: '《太上感应篇》' },

  // === 太上老君说常清静经 ===
  { text: '人能常清静，天地悉皆归。', source: '《太上老君说常清静经》' },
  { text: '夫人神好清，而心扰之；人心好静，而欲牵之。', source: '《太上老君说常清静经》' },
  { text: '常能遣其欲而心自静，澄其心而神自清。', source: '《太上老君说常清静经》' },
  { text: '欲既不生，即是真静。', source: '《太上老君说常清静经》' },
  { text: '真常应物，真常得性；常应常静，常清静矣。', source: '《太上老君说常清静经》' },
  { text: '如此清静，渐入真道；既入真道，名为得道。', source: '《太上老君说常清静经》' },
  { text: '虽名得道，实无所得；为化众生，名为得道。', source: '《太上老君说常清静经》' },

  // === 黄帝阴符经 ===
  { text: '观天之道，执天之行，尽矣。', source: '《黄帝阴符经》' },
  { text: '天性人也，人心机也。立天之道，以定人也。', source: '《黄帝阴符经》' },
  { text: '绝利一源，用师十倍；三返昼夜，用师万倍。', source: '《黄帝阴符经》' },
  { text: '知之修炼，谓之圣人。', source: '《黄帝阴符经》' },
  { text: '宇宙在乎手，万化生乎身。', source: '《黄帝阴符经》' },

  // === 太乙金华宗旨 ===
  { text: '回光之法，原于大道。', source: '《太乙金华宗旨》' },
  { text: '圣圣相传，不离返照。', source: '《太乙金华宗旨》' },
  { text: '孔门曰知止，释迦曰观心，老子曰内观。', source: '《太乙金华宗旨》' },
  { text: '神丹九转，不离守中。', source: '《太乙金华宗旨》' },
  { text: '自然曰道，道无名相，一性而已。', source: '《太乙金华宗旨》' },

  // === 庄子（南华经） ===
  { text: '吾生也有涯，而知也无涯。', source: '《庄子·养生主》' },
  { text: '安时而处顺，哀乐不能入也。', source: '《庄子·养生主》' },
  { text: '指穷于为薪，火传也，不知其尽也。', source: '《庄子·养生主》' },
  { text: '大鹏一日同风起，扶摇直上九万里。', source: '《庄子·逍遥游》意境' },
  { text: '举世誉之而不加劝，举世非之而不加沮。', source: '《庄子·逍遥游》' },
  { text: '至人无己，神人无功，圣人无名。', source: '《庄子·逍遥游》' },
  { text: '天地与我并生，而万物与我为一。', source: '《庄子·齐物论》' },
  { text: '大知闲闲，小知间间。', source: '《庄子·齐物论》' },
  { text: '人皆知有用之用，而莫知无用之用也。', source: '《庄子·人间世》' },
  { text: '古之真人，其寝不梦，其觉无忧。', source: '《庄子·大宗师》' },
  { text: '相濡以沫，不如相忘于江湖。', source: '《庄子·大宗师》' },
  { text: '泉涸，鱼相与处于陆，相呴以湿，相濡以沫，不如相忘于江湖。', source: '《庄子·大宗师》' },
  { text: '朴素而天下莫能与之争美。', source: '《庄子·天道》' },
  { text: '水静则明，况精神乎！', source: '《庄子·天道》' },
  { text: '用志不分，乃凝于神。', source: '《庄子·达生》' },
  { text: '以神遇而不以目视，官知止而神欲行。', source: '《庄子·养生主》' },
  { text: '真者，精诚之至也。不精不诚，不能动人。', source: '《庄子·渔父》' },
  { text: '荃者所以在鱼，得鱼而忘荃。', source: '《庄子·外物》' },
  { text: '得意而忘言。', source: '《庄子·外物》' },

  // === 列子（冲虚真经） ===
  { text: '生者，理之必终者也。终者不得不终，亦如生者之不得不生。', source: '《列子·天瑞》' },
  { text: '善为化者，其道密庸。', source: '《列子·周穆王》' },
  { text: '信命者，亡寿夭；信理者，亡是非。', source: '《列子·力命》' },
  { text: '内不得于心，外不应于器。', source: '《列子·说符》' },
  { text: '大道以多歧亡羊，学者以多方丧生。', source: '《列子·说符》' },
  { text: '圣人不察存亡，而察其所以然。', source: '《列子·说符》' },

  // === 文子（通玄真经） ===
  { text: '道者，虚无、平易、清静、柔弱、纯粹素朴。', source: '《文子·道原》' },
  { text: '上学以神听，中学以心听，下学以耳听。', source: '《文子·道德》' },
  { text: '清静者，德之至也；柔弱者，道之用也。', source: '《文子·道原》' },
  { text: '欲刚者必以柔守之，欲强者必以弱保之。', source: '《文子·道原》' },
  { text: '见小守柔，退让为务。', source: '《文子·微明》' },
  { text: '人有顺逆之气生于心，心治则气顺。', source: '《文子·九守》' },

  // === 洞灵真经（亢仓子） ===
  { text: '圣人贵精，众人贵粗。', source: '《洞灵真经·全道》' },
  { text: '静则无为，无为则命不可夺也。', source: '《洞灵真经·全道》' },
  { text: '水之性，欲清，沙石秽之；人之性，欲平，嗜欲害之。', source: '《洞灵真经·用道》' },
  { text: '导筋骨则形全，剪情欲则神全，靖言语则福全。', source: '《洞灵真经·用道》' },
  { text: '知而辨之谓之识，知而不辨谓之道。', source: '《洞灵真经·全道》' },
];

/**
 * 获取当日道家经典句子（基于日期种子，保证当天一致）
 * @returns {{ text: string, source: string }}
 */
function getDailyTaoistQuote() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % TAOIST_QUOTES.length;
  return TAOIST_QUOTES[index];
}
