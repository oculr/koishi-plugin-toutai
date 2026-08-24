import { Context, h, RuntimeError, Schema } from "koishi";
import {} from "koishi-plugin-markdown-to-image-service";
import {} from "koishi-plugin-puppeteer";
import * as path from "path";
import * as fs from "fs";

export let name = "toutai";
export const inject = {
  required: ["database", "puppeteer"],
  optional: ["markdownToImage"],
};
export const usage = `## 使用

1. 启动 \`puppeteer\` 服务。
2. 设置指令别名。`;

export interface Config {
  defaultMaxDisplayCount: number;
  nextReincarnationCooldownSeconds: number;

  shouldPrefixUsernameInMessageSending: boolean;
  retractDelay: number;
  isMapImageIncludedAfterRebirth: boolean;
  imageType: "png" | "jpeg" | "webp";
  isTextToImageConversionEnabled: boolean;
  isEnableQQOfficialRobotMarkdownTemplate: boolean;

  customTemplateId: string;
  key: string;
  numberOfMessageButtonsPerRow: number;
  isUsingUnifiedKoishiBuiltInUsername: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultMaxDisplayCount: Schema.number()
      .min(0)
      .default(20)
      .description("排行榜默认显示的人数。"),
    nextReincarnationCooldownSeconds: Schema.number()
      .min(0)
      .default(60)
      .description(`投胎的冷却时间，单位是秒。`),
    shouldPrefixUsernameInMessageSending: Schema.boolean()
      .default(true)
      .description(`是否在发送消息时加上 @用户名。`),
    retractDelay: Schema.number()
      .min(0)
      .default(0)
      .description(
        `自动撤回等待的时间，单位是秒。值为 0 时不启用自动撤回功能。`,
      ),
    isMapImageIncludedAfterRebirth: Schema.boolean()
      .default(true)
      .description(`是否在投胎后包含地图图片。`),
    imageType: Schema.union(["png", "jpeg", "webp"])
      .default("png")
      .description(`发送的图片类型。`),
    isTextToImageConversionEnabled: Schema.boolean()
      .default(false)
      .description(
        `是否开启将文本转为图片的功能（可选），如需启用，需要启用 \`markdownToImage\` 服务。`,
      ),
    isEnableQQOfficialRobotMarkdownTemplate: Schema.boolean()
      .default(false)
      .description(`是否启用 QQ 官方机器人的 Markdown 模板，带消息按钮。`),
  }),
  Schema.union([
    Schema.object({
      isEnableQQOfficialRobotMarkdownTemplate: Schema.const(true).required(),
      customTemplateId: Schema.string()
        .default("")
        .description(`自定义模板 ID。`),
      key: Schema.string()
        .default("")
        .description(
          `文本内容中特定插值的 key，用于存放文本。如果你的插值为 {{.info}}，那么请在这里填 info。`,
        ),
      numberOfMessageButtonsPerRow: Schema.number()
        .min(2)
        .max(5)
        .default(2)
        .description(`每行消息按钮的数量。`),
      isUsingUnifiedKoishiBuiltInUsername: Schema.boolean()
        .default(true)
        .description(`是否使用统一的 Koishi 内置用户名。`),
    }),
    Schema.object({}),
  ]),
]) as any;

declare module "koishi" {
  interface Tables {
    toutai_records: ToutaiRecord;
  }
}

export interface ToutaiRecord {
  id: number;
  userId: string;
  username: string;
  timestamp: string;
  numberOfStillbirthsInChina: number;
  numberOfStillbirthsInWorld: number;
  birthResultsInChina: BirthResultInChina[];
  birthResultsInWorld: BirthResultInWorld[];
  unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[];
}

interface BirthResultInWorld {
  index?: number;
  dictName: string;
  dictContinent: string;
  center: [number, number];
  coordinate: [number, number];
}

interface BirthResultInChina {
  id: number;
  order: string;
  index?: number;
  gender: string;
  category: string;
  province: string;
  probability: number;
}

interface UnfortunateDemiseRecordInWorld {
  index?: number;
  dictName: string;
  dictContinent: string;
}

interface Geometry {
  type: string;
  coordinates: number[][][];
}

interface Properties {
  name: string;
  cp: number[];
  childNum: number;
}

interface ChinaFeatures {
  type: string;
  id: string;
  properties: Properties;
  geometry: Geometry;
}

interface China {
  type: string;
  features: ChinaFeatures[];
}

interface BirthrateDetailedData {
  id: number;
  name: string;
  displayName: string;
  town: { [key: string]: { male: number; female: number } };
  city: { [key: string]: { male: number; female: number } };
  countryside: { [key: string]: { male: number; female: number } };
}

interface Region {
  id: string;
  name: string;
  total: number;
  male: number;
  female: number;
}

interface Country {
  code?: string;
  nameEn: string;
  nameCn: string;
  population: number;
  birthRate: number;
  position: [number, number];
  continent: string;
}

interface CountryData {
  [countryCode: string]: Country;
}

interface WorldBirthrateData {
  country: string;
  name: string;
  year: number;
  population: number;
  birthRate: number;
  births: number;
  birthRatePercentage: number;
}

interface NeonatalMortalityRateData {
  [key: string]: number;
}

const PROVINCE_REVIEWS: Record<string, string[]> = {
  北京: [
    "开局先问有没有户口，系统对新手很不友好。",
    "出生自带早高峰体验卡，起跑线堵在三环。",
  ],
  天津: [
    "相声技能没点亮不要紧，哏都空气会自动加点。",
    "煎饼果子是出生礼包，果篦儿属于隐藏装备。",
  ],
  河北: [
    "离北京很近，离北京的资源还得再走两步。",
    "地理位置像主角身边的可靠队友，戏份全靠自己抢。",
  ],
  山西: [
    "地下是煤，地上是醋，这局资源点得很实在。",
    "古建密度高，随便出门都像误入历史副本。",
  ],
  内蒙古: [
    "地图大到串门像跨服，坐骑建议尽早升级。",
    "风景负责辽阔，你负责别把五公里说成就在旁边。",
  ],
  辽宁: [
    "澡堂与烧烤双天赋，社交回血速度拉满。",
    "一开口就容易获得大哥大姐的临时编制。",
  ],
  吉林: [
    "冬季地图自带冰雪皮肤，抗寒是被动技能。",
    "人参和大米都挺能打，低调得像没买热搜。",
  ],
  黑龙江: [
    "新手村温度偏硬核，睫毛先学会结冰。",
    "冬天是超长赛季，出门装备栏至少占八格。",
  ],
  上海: [
    "咖啡浓度决定清醒程度，房价负责让你彻底清醒。",
    "开局地图不大，但每平方米都很有存在感。",
  ],
  江苏: [
    "十三太保各玩各的，省内聊天自带阵营判断。",
    "教育副本竞争激烈，试卷可能比你先成年。",
  ],
  浙江: [
    "经商天赋树很亮，朋友圈容易提前进入融资轮。",
    "七山二水一分田，剩下那一分拿来做电商。",
  ],
  安徽: [
    "南北口味在这里握手言和，然后继续争论。",
    "看着低调，实际到处给长三角输送隐藏高手。",
  ],
  福建: [
    "山海地图复杂，隔壁村口音都可能是加密频道。",
    "茶桌是本地会议室，聊着聊着项目就落地了。",
  ],
  江西: [
    "存在感经常被邻居借走，但辣度绝不缺席。",
    "山水很多，出省打工的传送门也很多。",
  ],
  山东: [
    "饭桌礼仪支线丰富，座次排错可能触发隐藏剧情。",
    "身高和煎饼都容易超出你的预期。",
  ],
  河南: [
    "历史名人服务器，人均祖上都能翻出一段主线。",
    "人口大服排队正常，但高手也是真的多。",
  ],
  湖北: [
    "九省通衢意味着去哪都方便，也意味着哪都堵得进来。",
    "过早是每日任务，碳水搭配主打一个自由。",
  ],
  湖南: [
    "辣椒是基础属性，不能吃辣属于困难模式。",
    "娱乐产业天赋突出，普通话偶尔自动切成塑普。",
  ],
  广东: [
    "早茶一坐半天，搞钱一天不歇，时间管理大师服。",
    "天气只有热和更热，羽绒服属于限时收藏品。",
  ],
  广西: [
    "山水像开了高清滤镜，螺蛳粉负责气味特效。",
    "普通话、白话和方言随机切换，语言包很豪华。",
  ],
  海南: [
    "出生点自带海景滤镜，代价是夏天持续加载。",
    "别人来度假，你在台风天研究外卖什么时候恢复。",
  ],
  重庆: [
    "导航只负责提出建议，立体地图才是最终 Boss。",
    "火锅是回血点，微辣是对外地人的善意谎言。",
  ],
  四川: [
    "生活节奏看着安逸，麻将桌上的胜负欲一点不安逸。",
    "熊猫负责卖萌，花椒负责让你的嘴失去方向感。",
  ],
  贵州: [
    "山路十八弯，出门先完成一段地形挑战。",
    "景色像壁纸，折耳根像味觉阵营测试。",
  ],
  云南: [
    "菌子副本奖励丰厚，但幻觉支线请谨慎触发。",
    "气候和风景都很会营业，海拔偶尔收点门票。",
  ],
  西藏: [
    "海拔先给你上强度，风景再负责精神补偿。",
    "离天空很近，离包邮规则有时稍远。",
  ],
  陕西: [
    "一铲子下去可能要停工考古，建设进度随缘。",
    "碳水做法多到能组一支门派，肉夹馍只是迎宾。",
  ],
  甘肃: [
    "地图细长得像加载进度条，牛肉面是稳定服务器。",
    "河西走廊主线厚重，风沙特效也舍得开。",
  ],
  青海: [
    "湖景和高原是顶配画质，氧气属于稀有补给。",
    "地广人稀，快递员才是真正的耐力型英雄。",
  ],
  宁夏: [
    "面积不抢镜，葡萄酒和羊肉却偷偷点满技能。",
    "塞上江南小地图，内容密度比占地面积高。",
  ],
  新疆: [
    "地图大到同省异地也像远征，时差感很有参与感。",
    "瓜果甜度拉满，距离负责给热情上强度。",
  ],
  香港: [
    "地图紧凑得像压缩包，效率和楼层一起往上叠。",
    "茶餐厅菜单像技能树，选择困难先扣一点体力。",
  ],
  澳门: [
    "小地图却装了很多霓虹，出生点自带夜景皮肤。",
    "面积很克制，游客密度一点不克制。",
  ],
  台湾: [
    "便利店像存档点，走几步就能补给一次。",
    "夜市支线丰富，减肥任务大概率延期。",
  ],
};

const COUNTRY_REVIEWS: Record<string, string[]> = {
  中国: [
    "超大地图多生态服务器，一辈子也未必能全图鉴。",
    "开局语言包叫普通话，地方扩展包却多得离谱。",
  ],
  美国: [
    "自由度很高，账单也很自由地追着你跑。",
    "地图大、车位大、饮料大，只有年假比较含蓄。",
  ],
  日本: [
    "便利店密度拉满，垃圾桶刷新率却像稀有怪。",
    "电车准点得像脚本，上班时间长得像主线。",
  ],
  韩国: [
    "网速和生活节奏都很快，睡眠属于付费 DLC。",
    "咖啡店刷新频繁，外貌管理是高难日常任务。",
  ],
  新加坡: [
    "新手教程写得很细，违规扣分也写得很清楚。",
    "城市像精装样板间，空调是第二气候。",
  ],
  印度: [
    "人口大服，排队和天才都能刷出史诗级数量。",
    "香料技能点满，味觉从出生就进入高强度训练。",
  ],
  英国: [
    "天气每天抽卡，晴天属于限定皮肤。",
    "先聊两句天气，才算通过社交登录验证。",
  ],
  法国: [
    "面包是每日任务，罢工是服务器维护公告。",
    "浪漫值看着很高，办事窗口仍然按自己的节奏。",
  ],
  德国: [
    "规则说明书比剧情长，但列车偶尔也会即兴发挥。",
    "工程技能点满，幽默模块采用工业级隐藏设计。",
  ],
  意大利: [
    "手势也是官方语言，聊天时双手不能挂机。",
    "古迹和咖啡负责审美，办事效率负责修炼耐心。",
  ],
  瑞士: ["景色像默认壁纸，物价像付费墙。", "钟表很准，钱包变薄的速度也很准。"],
  荷兰: [
    "自行车才是本体，行人过马路像闯入车道副本。",
    "地势很低，生活品质倒是努力往高处点。",
  ],
  加拿大: [
    "地图巨大人口稀疏，邻居可能在下一个加载区。",
    "礼貌是被动技能，冬天是常驻 Boss。",
  ],
  澳大利亚: [
    "动物图鉴自带战斗属性，出门像随机遭遇。",
    "海滩很美，紫外线也想热情参与你的人生。",
  ],
  新西兰: [
    "羊比人更像常驻玩家，风景负责承包屏保。",
    "世界尽头的新手村，安静得能听见网购物流叹气。",
  ],
  巴西: [
    "足球和桑巴自带 BGM，治安提示也记得打开。",
    "热情值点满，地图跨度和贫富差距都很有存在感。",
  ],
  阿根廷: [
    "牛肉与足球双主线，经济系统偶尔刷新规则。",
    "探戈步伐很稳，汇率走势比较即兴。",
  ],
  墨西哥: [
    "玉米饼能组合出整套技能，辣椒负责暴击。",
    "色彩和音乐都很热闹，仙人掌在旁边冷静围观。",
  ],
  埃及: [
    "出生点附近就是人类文明老存档，游客常年读档。",
    "金字塔负责几千年流量，太阳负责每日高亮。",
  ],
  俄罗斯: [
    "地图大得像没裁边，冬季难度也没调低。",
    "文学支线很深沉，保暖装备是主线刚需。",
  ],
  泰国: [
    "夜市与水果负责快乐，热浪负责保持清醒。",
    "微笑是通用表情包，堵车是常驻加载画面。",
  ],
  越南: [
    "摩托车流像实时弹幕，过马路需要信念感。",
    "咖啡负责提神，天气负责让你继续点冰。",
  ],
  阿联酋: [
    "沙漠地图装了未来城市皮肤，空调是生存系统。",
    "摩天楼争着突破天花板，室外温度负责劝退。",
  ],
};

const CONTINENT_REVIEWS: Record<string, string[]> = {
  亚洲: [
    "人口大服竞争激烈，美食扩展包倒是诚意十足。",
    "文化地图层数太多，新手教程建议慢慢读。",
  ],
  欧洲: [
    "古迹密度高，跨个边境像切换语言频道。",
    "年假体验不错，物价负责提醒你别太沉浸。",
  ],
  非洲: [
    "自然资源与野生动物图鉴豪华，气候难度看出生点。",
    "地图辽阔，年轻玩家多，未来剧情全靠现场更新。",
  ],
  北美洲: [
    "大地图偏爱大车和大份量，通勤距离也不甘示弱。",
    "玩法自由度高，但保险和账单支线很长。",
  ],
  南美洲: [
    "音乐、足球和烤肉都是高人气职业。",
    "热情负责开场，经济波动负责突然加戏。",
  ],
  大洋洲: [
    "风景像壁纸，地理位置像被单独放在群聊外。",
    "海岛体验很强，物流时间也很有海岛感。",
  ],
  南极洲: [
    "隐藏服务器只有科研职业，普通玩家暂未开放注册。",
    "没有房价焦虑，因为连商品房系统都没上线。",
  ],
};

const SETTLEMENT_REVIEWS: Record<string, string[]> = {
  城市: [
    "高楼是出生动画，通勤是每日副本，房租是固定伤害。",
    "资源刷得快，生活也催得快，电梯里先学会赶时间。",
  ],
  城镇: [
    "地图不大，熟人网络覆盖率比 5G 还高。",
    "奶茶店和亲戚消息都更新很快，秘密很难活过上午。",
  ],
  乡村: [
    "院子和星空都很宽，快递时效则选择了田园节奏。",
    "开局自然资源丰富，娱乐项目主要靠自己开发。",
  ],
};

const BIRTH_ORDER_REVIEWS: Record<string, string[]> = {
  一: [
    "独生位开局，关注度吃满，试错过程全程直播。",
    "家族资源先向你集中，家族期待也顺便打包寄到。",
  ],
  二: [
    "自带一位前辈攻略，也自带全年对比榜单。",
    "旧装备继承概率上升，争宠玩法正式解锁。",
  ],
  三: [
    "三人小队成型，家里从精细运营转向规模化管理。",
    "父母的育儿技能已熟练，你的照片数量可能开始优化。",
  ],
  四: [
    "家庭副本进入团队战，安静成为稀有掉落。",
    "排行不算靠前，但甩锅路线明显更加丰富。",
  ],
  五及以上: [
    "直接加入满编战队，吃饭都像公会活动。",
    "父母进入宗师段位，你主要依靠兄姐带练。",
  ],
};

function pickReview(seed: string, reviews: string[]): string {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return reviews[hash % reviews.length];
}

function getAttemptReview(attempt: number): string {
  if (attempt === 1) return "首抽就敢开盲盒，勇气属性已经点亮。";
  if (attempt <= 3) return "还在新手保护期，多投几次就有统计学体感了。";
  if (attempt <= 10) return "轮回大厅已经认识你，门禁卡建议长期保留。";
  return `这是第 ${attempt} 次读档，孟婆见你都准备办月卡了。`;
}

function buildChinaReview(result: BirthResultInChina, attempt: number): string {
  const provinceReviews = PROVINCE_REVIEWS[result.province] || [
    `${result.province}成功抢到本轮镜头，剩下的剧情靠你现场发挥。`,
  ];
  const settlementReviews = SETTLEMENT_REVIEWS[result.category] || [
    "落点资料还在加载，先把适应力点上。",
  ];
  const orderReviews = BIRTH_ORDER_REVIEWS[result.order] || [
    "家庭排位比较神秘，建议进群后先观察阵容。",
  ];

  return [
    `📍省份锐评：${pickReview(`${result.province}-${attempt}`, provinceReviews)}`,
    `🏘️城乡锐评：${pickReview(`${result.category}-${attempt}`, settlementReviews)}`,
    `👶排位锐评：${pickReview(`${result.order}-${attempt}`, orderReviews)}`,
    `🔁轮回锐评：${getAttemptReview(attempt)}`,
  ].join("\n");
}

function buildWorldReview(
  country: string,
  continent: string,
  attempt: number,
): string {
  const countryReviews = COUNTRY_REVIEWS[country] || [
    `${country}这张卡不算常见，攻略不够就靠临场发挥。`,
    `出生点锁定${country}，世界地图又亮了一块。`,
  ];
  const continentReviews = CONTINENT_REVIEWS[continent] || [
    `${continent}服务器资料较少，探索奖励暂时未知。`,
  ];

  return [
    `🌍国家锐评：${pickReview(`${country}-${attempt}`, countryReviews)}`,
    `🧭大洲锐评：${pickReview(`${continent}-${country}`, continentReviews)}`,
    `🔁轮回锐评：${getAttemptReview(attempt)}`,
  ].join("\n");
}

// 通用样式定义，减少重复代码
const COMMON_CSS = `
  body {
      background-color: #F5F3EF;
      font-family: 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      box-sizing: border-box;
  }
  .container {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.08);
      padding: 40px;
      width: 100%;
      max-width: 900px;
  }
  h1 {
      text-align: center;
      font-size: 36px;
      color: #333;
      margin-bottom: 30px;
      margin-top: 0;
      font-weight: 700;
  }
  table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      background: white;
      border-radius: 8px;
      overflow: hidden;
  }
  th {
      background-color: #F0F2F5;
      color: #444;
      font-weight: 600;
      padding: 16px;
      text-align: center;
      border-bottom: 2px solid #E1E4E8;
      font-size: 18px;
  }
  td {
      padding: 14px 16px;
      border-bottom: 1px solid #EEEEEE;
      text-align: center;
      color: #555;
      font-size: 18px;
  }
  tr:last-child td {
      border-bottom: none;
  }
  tr:nth-child(even) {
      background-color: #FAFAFA;
  }
  .overview-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 20px;
  }
  .stat-card {
      background: #F9FAFB;
      padding: 20px;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #EAEAEA;
  }
  .stat-label {
      color: #666;
      font-size: 20px;
      font-weight: 500;
  }
  .stat-value {
      color: #222;
      font-size: 22px;
      font-weight: bold;
  }
  .user-info {
      background: #E8F3FF;
      border-color: #BAE0FF;
      grid-column: span 2;
      justify-content: center;
  }
  .user-info .stat-label {
      color: #0050B3;
      margin-right: 10px;
  }
  .user-info .stat-value {
      color: #003A8C;
  }
  .chart-container {
      width: 100%;
      height: 500px; /* 默认高度，可覆盖 */
      margin-top: 20px;
      position: relative;
  }
`;

export function apply(ctx: Context, config: Config) {
  ctx.database.extend(
    "toutai_records",
    {
      id: "unsigned",
      userId: "string",
      username: "string",
      timestamp: { type: "string", initial: "" },
      birthResultsInChina: { type: "json", initial: [] },
      birthResultsInWorld: { type: "json", initial: [] },
      numberOfStillbirthsInChina: { type: "unsigned", initial: 0 },
      numberOfStillbirthsInWorld: { type: "unsigned", initial: 0 },
      unfortunateDemiseRecordsInWorld: { type: "json", initial: [] },
    },
    {
      primary: "id",
      autoInc: true,
    },
  );

  const filePath = path.join(__dirname, "emptyHtml.html").replace(/\\/g, "/");
  const pageGotoFilePath = "file://" + filePath;
  const ChinaJsonFilePath = path.join(__dirname, "assets", "China.json");
  const worldJsonFilePath = path.join(__dirname, "assets", "world.json");
  const worldDataJsonFilePath = path.join(
    __dirname,
    "assets",
    "worldData.json",
  );
  const worldBirthrateJsonFilePath = path.join(
    __dirname,
    "assets",
    "worldBirthrate.json",
  );
  const birthrateDetailedJsonFilePath = path.join(
    __dirname,
    "assets",
    "birthrateDetailed.json",
  );
  const neonatalMortalityRateJsonFilePath = path.join(
    __dirname,
    "assets",
    "neonatalMortalityRate.json",
  );

  // 同步读取文件，保留原有逻辑
  const ChinaData: China = JSON.parse(
    fs.readFileSync(ChinaJsonFilePath, "utf-8"),
  );
  const world: CountryData = JSON.parse(
    fs.readFileSync(worldJsonFilePath, "utf-8"),
  );
  const worldData: CountryData = JSON.parse(
    fs.readFileSync(worldDataJsonFilePath, "utf-8"),
  );
  const worldBirthrateData: WorldBirthrateData[] = JSON.parse(
    fs.readFileSync(worldBirthrateJsonFilePath, "utf-8"),
  );
  const birthrateDetailedData: BirthrateDetailedData[] = JSON.parse(
    fs.readFileSync(birthrateDetailedJsonFilePath, "utf-8"),
  );
  const neonatalMortalityRateData: NeonatalMortalityRateData = JSON.parse(
    fs.readFileSync(neonatalMortalityRateJsonFilePath, "utf-8"),
  );

  const logger = ctx.logger("toutai");
  const isQQOfficialRobotMarkdownTemplateEnabled =
    config.isEnableQQOfficialRobotMarkdownTemplate &&
    config.key !== "" &&
    config.customTemplateId !== "";
  const totalPopulation = birthrateDetailedData.reduce((total, region) => {
    if (region.name === "national") return total;
    const multiplier = isSpecialProvince(region.name) ? 1 : 10;
    for (const category of ["town", "city", "countryside"] as const) {
      for (const order of [
        "one",
        "two",
        "three",
        "four",
        "fivePlus",
      ] as const) {
        total +=
          (region[category][order].male + region[category][order].female) *
          multiplier;
      }
    }
    return total;
  }, 0);
  const continentDict = {
    AF: "非洲",
    EU: "欧洲",
    AS: "亚洲",
    OA: "大洋洲",
    NA: "北美洲",
    SA: "南美洲",
    AN: "南极洲",
  };

  ctx.command("toutai", "投胎模拟器帮助").action(async ({ session }) => {
    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq") {
      return await sendMessage(
        session,
        `👨♂- 《投胎模拟器》 -♀👩
😆 欢迎游玩~ 祝您玩得开心！`,
        `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    }
    await session.execute(`toutai -h`);
  });

  ctx.command("toutai.投胎中国", "投胎到中国").action(async ({ session }) => {
    let { userId, username, timestamp } = session;
    username = await getSessionUserName(session);
    await updateNameInPlayerRecord(session, userId, username);
    const toutaiRecord = await ctx.database.get("toutai_records", { userId });
    if (toutaiRecord.length !== 0) {
      const lastTimestamp = Number(toutaiRecord[0].timestamp);
      const timeDifference = calculateTimeDifference(lastTimestamp, timestamp);
      const remainingWaitTime = Math.floor(
        config.nextReincarnationCooldownSeconds - timeDifference,
      );
      if (timeDifference < config.nextReincarnationCooldownSeconds) {
        return await sendMessage(
          session,
          `请等待 ${remainingWaitTime} 秒后再投胎。`,
          `投胎中国 投胎世界 改名`,
          2,
        );
      }
    }
    const isRebirth = simulateRebirth(neonatalMortalityRateData["中国"]);
    if (!isRebirth) {
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          numberOfStillbirthsInChina:
            toutaiRecord[0].numberOfStillbirthsInChina + 1,
          timestamp: String(timestamp),
        },
      );
      await sendMessage(
        session,
        `抱歉，您在这次投胎中不幸夭折，再试一次吧！`,
        `投胎中国 投胎世界 改名`,
        2,
      );
    } else {
      const birthResult = simulateBirthInChina();
      if (toutaiRecord.length !== 0) {
        birthResult.index = toutaiRecord[0].birthResultsInChina.length + 1;
        toutaiRecord[0].birthResultsInChina.push(birthResult);
        await ctx.database.set(
          "toutai_records",
          { userId },
          {
            birthResultsInChina: toutaiRecord[0].birthResultsInChina,
            timestamp: String(timestamp),
          },
        );
      } else {
        birthResult.index = 1;
        await ctx.database.create("toutai_records", {
          userId: userId,
          username: username,
          birthResultsInChina: [birthResult],
          timestamp: String(timestamp),
        });
      }
      const attempt =
        birthResult.index ?? toutaiRecord[0].birthResultsInChina.length;
      const message = [
        `🎲 第 ${attempt} 次投胎：出生在${birthResult.province}${birthResult.category}，是${translateGenderChild(birthResult.gender)}，家中排行第${birthResult.order}胎。`,
        buildChinaReview(birthResult, attempt),
      ].join("\n");
      const mapBuffer = await generateChinaMap(
        toutaiRecord[0].birthResultsInChina,
        birthResult,
      );
      const hImg = config.isMapImageIncludedAfterRebirth
        ? `${h.image(mapBuffer, `image/${config.imageType}`)}\n`
        : ``;
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          message,
          `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      } else {
        await sendMessage(
          session,
          `${hImg}${message}`,
          `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
    }
  });

  ctx.command("toutai.投胎世界", "投胎到世界").action(async ({ session }) => {
    let { userId, username, timestamp } = session;
    username = await getSessionUserName(session);
    await updateNameInPlayerRecord(session, userId, username);
    const toutaiRecord = await ctx.database.get("toutai_records", { userId });
    if (toutaiRecord.length !== 0) {
      const lastTimestamp = Number(toutaiRecord[0].timestamp);
      const timeDifference = calculateTimeDifference(lastTimestamp, timestamp);
      const remainingWaitTime = Math.floor(
        config.nextReincarnationCooldownSeconds - timeDifference,
      );
      if (timeDifference < config.nextReincarnationCooldownSeconds) {
        return await sendMessage(
          session,
          `请等待 ${remainingWaitTime} 秒后再投胎。`,
          `投胎中国 投胎世界 改名`,
        );
      }
    }
    const rebornCountry = simulateRebirthInWorld(worldBirthrateData);
    let foundElement = null;
    for (const countryCode in worldData) {
      if (worldData[countryCode].nameCn === rebornCountry) {
        foundElement = worldData[countryCode];
        break;
      }
    }
    const coordinate = foundElement["position"];
    const center = foundElement["position"];
    const dictName = foundElement["nameCn"];
    const dictContinent = continentDict[foundElement["continent"]];
    const neonatalMortalityRate = neonatalMortalityRateData[dictName] || 0;
    if (
      neonatalMortalityRate !== 0 &&
      !simulateRebirth(neonatalMortalityRate)
    ) {
      toutaiRecord[0].unfortunateDemiseRecordsInWorld.push({
        index: toutaiRecord[0].unfortunateDemiseRecordsInWorld.length + 1,
        dictName,
        dictContinent,
      });
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          numberOfStillbirthsInWorld:
            toutaiRecord[0].numberOfStillbirthsInWorld + 1,
          timestamp: String(timestamp),
          unfortunateDemiseRecordsInWorld:
            toutaiRecord[0].unfortunateDemiseRecordsInWorld,
        },
      );
      return await sendMessage(
        session,
        `💀 您投胎到${dictContinent}的${dictName}后不幸夭折，本轮光速退号。\n🌍国家锐评：${pickReview(dictName, COUNTRY_REVIEWS[dictName] || [`${dictName}的出生卡刚翻开就合上了，下次再读档。`])}`,
        `投胎中国 投胎世界 改名`,
      );
    }
    const birthResultInWorld = {
      index: 0,
      dictName,
      dictContinent,
      coordinate,
      center,
    };
    if (toutaiRecord.length !== 0) {
      birthResultInWorld.index = toutaiRecord[0].birthResultsInWorld.length + 1;
      toutaiRecord[0].birthResultsInWorld.push(birthResultInWorld);
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          birthResultsInWorld: toutaiRecord[0].birthResultsInWorld,
          timestamp: String(timestamp),
        },
      );
    } else {
      birthResultInWorld.index = 1;
      await ctx.database.create("toutai_records", {
        userId: userId,
        username: username,
        birthResultsInWorld: [birthResultInWorld],
        timestamp: String(timestamp),
      });
    }
    const mapBuffer = await generateWorldMap(birthResultInWorld);
    const hImg = config.isMapImageIncludedAfterRebirth
      ? `${h.image(mapBuffer, `image/${config.imageType}`)}\n`
      : ``;
    const attempt =
      birthResultInWorld.index ?? toutaiRecord[0].birthResultsInWorld.length;
    const message = [
      `🎲 第 ${attempt} 次投胎：出生在${dictContinent}的${dictName}。`,
      buildWorldReview(dictName, dictContinent, attempt),
    ].join("\n");
    if (
      !config.isTextToImageConversionEnabled &&
      isQQOfficialRobotMarkdownTemplateEnabled &&
      session.platform === "qq"
    ) {
      await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
      return await sendMessage(
        session,
        message,
        `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
      );
    } else {
      await sendMessage(
        session,
        `${hImg}${message}`,
        `投胎中国排行榜 投胎世界排行榜 中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
      );
    }
  });

  ctx
    .command("toutai.中国投胎记录", "中国投胎记录帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `可查询的中国投胎记录如下：
请输入要查询的【类型】：`,
          `中国投胎记录总览 中国投胎成功历史 中国投胎地区分布 中国投胎性别分布 中国投胎第一次出现记录`,
          2,
        );
      }
      await session.execute(`toutai.中国投胎记录 -h`);
    });

  ctx
    .command("toutai.中国投胎记录.总览 [targetUser:text]", "中国投胎记录总览")
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;

      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎中国的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }

      const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
        "toutai_records",
        {},
      );
      const userRank = getUserRankInChinaBirthResults(
        toutaiRecords,
        targetUserId,
      );
      const userStillbirthsRank = getChinaStillbirthsRanking(
        toutaiRecords,
        userId,
      );

      const { birthResultsInChina, numberOfStillbirthsInChina } =
        targetUserRecord[0];
      const analysisResult = analyzeChinaBirthResults(birthResultsInChina);
      const buffer = await generateChinaBirthOverviewTableImage(
        trimUsername(targetUserRecord[0].username),
        analysisResult,
        userRank,
        userStillbirthsRank,
        numberOfStillbirthsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.成功历史 [targetUser:text]",
      "中国投胎成功历史",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎中国的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const last20Records = birthResultsInChina.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInChinaArray(
        trimUsername(targetUserRecord[0].username),
        last20Records,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.地区分布 [targetUser:text]",
      "中国投胎地区分布",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎中国的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const buffer = await generateBirthRegionHorizontalBarChartRankings(
        trimUsername(targetUserRecord[0].username),
        birthResultsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.性别分布 [targetUser:text]",
      "中国投胎性别分布",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎中国的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const buffer = await generateChineseBirthGenderDistributionPieChart(
        trimUsername(targetUserRecord[0].username),
        birthResultsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.中国投胎记录.第一次出现 [targetUser:text]",
      "中国投胎第一次出现",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInChina.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎中国的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInChina } = targetUserRecord[0];
      const buffer = await generateFirstChineseReincarnationRecordTableImage(
        trimUsername(targetUserRecord[0].username),
        birthResultsInChina,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command("toutai.世界投胎记录", "世界投胎记录帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `可查询的世界投胎记录如下：
请输入要查询的【类型】：`,
          `世界投胎成功历史 世界投胎夭折历史 世界投胎记录总览`,
          2,
        );
      }
      await session.execute(`toutai.世界投胎记录 -h`);
    });

  ctx
    .command("toutai.世界投胎记录.总览 [targetUser:text]", "世界投胎记录总览")
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;

      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInWorld.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎世界的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }

      const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
        "toutai_records",
        {},
      );
      const rankResult = getWorldRanking(toutaiRecords, targetUserId);
      const userRank = rankResult.birthResultsRank;
      const userStillbirthsRank = rankResult.numberOfStillbirthsRank;

      const { birthResultsInWorld, numberOfStillbirthsInWorld } =
        targetUserRecord[0];
      const analysisResult = analyzeWorldBirthResults(birthResultsInWorld);
      const buffer = await generateWorldBirthOverviewTableImage(
        trimUsername(targetUserRecord[0].username),
        analysisResult,
        userRank,
        userStillbirthsRank,
        numberOfStillbirthsInWorld,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.世界投胎记录.成功历史 [targetUser:text]",
      "世界投胎成功历史",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].birthResultsInWorld.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎世界的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { birthResultsInWorld } = targetUserRecord[0];
      const last20Records = birthResultsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer = await generateTableImageFromBirthResultsInWorldArray(
        trimUsername(targetUserRecord[0].username),
        last20Records,
      );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command(
      "toutai.世界投胎记录.夭折历史 [targetUser:text]",
      "世界投胎夭折历史",
    )
    .action(async ({ session }, targetUser) => {
      let { userId, username } = session;
      username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);
      const result = await processTargetUser(
        session,
        userId,
        username,
        targetUser,
      );
      const targetUserRecord: ToutaiRecord[] = result.targetUserRecord;
      const targetUserId: string = result.targetUserId;
      if (
        targetUserRecord.length === 0 ||
        targetUserRecord[0].unfortunateDemiseRecordsInWorld.length === 0
      ) {
        return sendMessage(
          session,
          `被查询对象暂无投胎世界的记录。`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
        );
      }
      const { unfortunateDemiseRecordsInWorld } = targetUserRecord[0];
      const last20Records = unfortunateDemiseRecordsInWorld.slice(-20);
      last20Records.sort((a, b) => (b.index || 0) - (a.index || 0));
      const buffer =
        await generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(
          trimUsername(targetUserRecord[0].username),
          last20Records,
        );
      const hImg = h.image(buffer, `image/${config.imageType}`);
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
        return await sendMessage(
          session,
          `<@${userId}>`,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      }
      await sendMessage(
        session,
        hImg,
        `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
        2,
        false,
      );
    });

  ctx
    .command("toutai.中国投胎排行榜", "中国投胎排行榜帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `可查看的中国投胎排行榜如下：
请输入要查看的【类型】：`,
          `中国投胎成功次数 中国投胎夭折次数 中国投胎男孩次数 中国投胎女孩次数`,
          2,
        );
      }
      await session.execute(`toutai.中国投胎排行榜 -h`);
    });

  ctx
    .command(
      "toutai.中国投胎排行榜.成功次数 [maxLeaderboardDisplayCount:number]",
      "中国投胎次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "请输入大于等于 0 的数字作为排行榜的最大显示数量。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateChineseBirthRankingsTableImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          "中国投胎成功次数排行榜 排名 用户名 成功次数",
          "birthResultsInChina.length",
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  ctx
    .command(
      "toutai.中国投胎排行榜.夭折次数 [maxLeaderboardDisplayCount:number]",
      "中国夭折次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "请输入大于等于 0 的数字作为排行榜的最大显示数量。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateChineseBirthRankingsTableImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          "中国投胎夭折次数排行榜 排名 用户名 夭折次数",
          "numberOfStillbirthsInChina",
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  const genders = ["male", "female"];
  genders.forEach((gender) => {
    ctx
      .command(
        `toutai.中国投胎排行榜.${translateGenderChild(gender)}次数 [maxLeaderboardDisplayCount:number]`,
        `中国投胎${translateGenderChild(gender)}次数排行榜`,
      )
      .action(
        async (
          { session },
          maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
        ) => {
          if (
            typeof maxLeaderboardDisplayCount !== "number" ||
            isNaN(maxLeaderboardDisplayCount) ||
            maxLeaderboardDisplayCount < 0
          ) {
            return "请输入大于等于 0 的数字作为排行榜的最大显示数量。";
          }
          let { userId, username } = session;
          username = await getSessionUserName(session);
          await updateNameInPlayerRecord(session, userId, username);
          const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
            "toutai_records",
            {},
          );
          const buffer = await generateChineseBirthRankingsTableImage2(
            toutaiRecords,
            maxLeaderboardDisplayCount,
            `中国投胎${translateGenderChild(gender)}次数排行榜 排名 用户名 次数 birthResultsInChina gender ${gender}`,
          );
          const hImg = h.image(buffer, `image/${config.imageType}`);
          if (
            !config.isTextToImageConversionEnabled &&
            isQQOfficialRobotMarkdownTemplateEnabled &&
            session.platform === "qq"
          ) {
            await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
            return await sendMessage(
              session,
              `<@${userId}>`,
              `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
              2,
              false,
            );
          }
          await sendMessage(
            session,
            hImg,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        },
      );
  });

  ctx
    .command("toutai.世界投胎排行榜", "世界投胎排行榜帮助")
    .action(async ({ session }, startIndex) => {
      if (
        !config.isTextToImageConversionEnabled &&
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        return await sendMessage(
          session,
          `可查看的世界投胎排行榜如下：
请输入要查看的【类型】：`,
          `世界投胎成功次数 世界投胎夭折次数 世界投胎亚洲次数 世界投胎欧洲次数 世界投胎南美洲次数 世界投胎南极洲次数 世界投胎大洋洲次数 世界投胎北美洲次数 世界投胎非洲次数`,
          2,
        );
      }
      await session.execute(`toutai.世界投胎排行榜 -h`);
    });

  ctx
    .command(
      "toutai.世界投胎排行榜.成功次数 [maxLeaderboardDisplayCount:number]",
      "世界投胎成功次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "请输入大于等于 0 的数字作为排行榜的最大显示数量。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateChineseBirthRankingsTableImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          "世界投胎成功次数排行榜 排名 用户名 成功次数",
          "birthResultsInWorld.length",
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  ctx
    .command(
      "toutai.世界投胎排行榜.夭折次数 [maxLeaderboardDisplayCount:number]",
      "世界投胎夭折次数排行榜",
    )
    .action(
      async (
        { session },
        maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
      ) => {
        if (
          typeof maxLeaderboardDisplayCount !== "number" ||
          isNaN(maxLeaderboardDisplayCount) ||
          maxLeaderboardDisplayCount < 0
        ) {
          return "请输入大于等于 0 的数字作为排行榜的最大显示数量。";
        }
        let { userId, username } = session;
        username = await getSessionUserName(session);
        await updateNameInPlayerRecord(session, userId, username);
        const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
          "toutai_records",
          {},
        );
        const buffer = await generateChineseBirthRankingsTableImage(
          toutaiRecords,
          maxLeaderboardDisplayCount,
          "世界投胎夭折次数排行榜 排名 用户名 夭折次数",
          "numberOfStillbirthsInWorld",
        );
        const hImg = h.image(buffer, `image/${config.imageType}`);
        if (
          !config.isTextToImageConversionEnabled &&
          isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq"
        ) {
          await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
          return await sendMessage(
            session,
            `<@${userId}>`,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        }
        await sendMessage(
          session,
          hImg,
          `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
          2,
          false,
        );
      },
    );

  const continents = [
    "非洲",
    "欧洲",
    "亚洲",
    "北美洲",
    "南美洲",
    "大洋洲",
    "南极洲",
  ];
  continents.forEach((continent) => {
    ctx
      .command(
        `toutai.世界投胎排行榜.${continent} [maxLeaderboardDisplayCount:number]`,
        `世界投胎${continent}次数排行榜`,
      )
      .action(
        async (
          { session },
          maxLeaderboardDisplayCount = config.defaultMaxDisplayCount,
        ) => {
          if (
            typeof maxLeaderboardDisplayCount !== "number" ||
            isNaN(maxLeaderboardDisplayCount) ||
            maxLeaderboardDisplayCount < 0
          ) {
            return "请输入大于等于 0 的数字作为排行榜的最大显示数量。";
          }
          let { userId, username } = session;
          username = await getSessionUserName(session);
          await updateNameInPlayerRecord(session, userId, username);
          const toutaiRecords: ToutaiRecord[] = await ctx.database.get(
            "toutai_records",
            {},
          );
          const buffer = await generateChineseBirthRankingsTableImage2(
            toutaiRecords,
            maxLeaderboardDisplayCount,
            `世界投胎${continent}次数排行榜 排名 用户名 次数 birthResultsInWorld dictContinent ${continent}`,
          );
          const hImg = h.image(buffer, `image/${config.imageType}`);
          if (
            !config.isTextToImageConversionEnabled &&
            isQQOfficialRobotMarkdownTemplateEnabled &&
            session.platform === "qq"
          ) {
            await sendMessage(session, hImg, `投胎中国 投胎世界`, 2, false);
            return await sendMessage(
              session,
              `<@${userId}>`,
              `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
              2,
              false,
            );
          }
          await sendMessage(
            session,
            hImg,
            `中国投胎记录 世界投胎记录 投胎中国 投胎世界 改名`,
            2,
            false,
          );
        },
      );
  });

  ctx
    .command("toutai.改名 [newPlayerName:text]", "更改玩家名字")
    .action(async ({ session }, newPlayerName) => {
      const { userId, user } = session;
      const username = await getSessionUserName(session);
      await updateNameInPlayerRecord(session, userId, username);

      newPlayerName = newPlayerName?.trim();
      if (!newPlayerName) {
        return sendMessage(
          session,
          `请输入新的玩家名字。`,
          `投胎中国 投胎世界 改名`,
        );
      }

      if (
        !(
          config.isEnableQQOfficialRobotMarkdownTemplate &&
          session.platform === "qq" &&
          config.key &&
          config.customTemplateId
        )
      ) {
        return sendMessage(
          session,
          `不是 QQ 官方机器人的话，不用改名哦~`,
          `改名`,
        );
      }

      if (newPlayerName.length > 20) {
        return sendMessage(
          session,
          `新的玩家名字过长，请重新输入。`,
          `投胎中国 投胎世界 改名`,
        );
      }

      if (newPlayerName.includes("@everyone")) {
        return sendMessage(
          session,
          `新的玩家名字不合法，请重新输入。`,
          `投胎中国 投胎世界 改名`,
        );
      }

      if (config.isUsingUnifiedKoishiBuiltInUsername) {
        return handleUnifiedKoishiUsername(session, newPlayerName);
      } else {
        return handleCustomUsername(ctx, session, userId, newPlayerName);
      }
    });

  async function handleUnifiedKoishiUsername(session, newPlayerName) {
    newPlayerName = h
      .transform(newPlayerName, { text: true, default: false })
      .trim();

    const users = await ctx.database.get("user", {});
    if (users.some((user) => user.name === newPlayerName)) {
      return sendMessage(session, `新的玩家名字已经存在，请重新输入。`, `改名`);
    }

    try {
      session.user.name = newPlayerName;
      await session.user.$update();
      return sendMessage(
        session,
        `玩家名字已更改为：【${newPlayerName}】`,
        `查询玩家记录 开始游戏 改名`,
        2,
      );
    } catch (error) {
      if (RuntimeError.check(error, "duplicate-entry")) {
        return sendMessage(
          session,
          `新的玩家名字已经存在，请重新输入。`,
          `改名`,
        );
      } else {
        logger.warn(error);
        return sendMessage(session, `玩家名字更改失败。`, `改名`);
      }
    }
  }

  async function handleCustomUsername(ctx, session, userId, newPlayerName) {
    const players = await ctx.database.get("toutai_records", {});
    if (players.some((player) => player.username === newPlayerName)) {
      return sendMessage(
        session,
        `新的玩家名字已经存在，请重新输入。`,
        `投胎中国 投胎世界 改名`,
      );
    }

    const userRecord = await ctx.database.get("toutai_records", { userId });
    if (userRecord.length === 0) {
      await ctx.database.create("toutai_records", {
        userId,
        username: newPlayerName,
      });
    } else {
      await ctx.database.set(
        "toutai_records",
        { userId },
        { username: newPlayerName },
      );
    }
    return await sendMessage(
      session,
      `玩家名字已更改为：【${newPlayerName}】`,
      `投胎中国 投胎世界 改名`,
      2,
    );
  }

  function simulateRebirthInWorld(
    worldData: WorldBirthrateData[],
  ): string | null {
    const totalBirths = worldData.reduce(
      (sum, country) => sum + country.births,
      0,
    );
    if (totalBirths <= 0) return null;

    const randomValue = Math.random() * totalBirths;
    let cumulativeBirths = 0;
    for (const country of worldData) {
      cumulativeBirths += country.births;
      if (randomValue < cumulativeBirths) return country.name;
    }

    for (let index = worldData.length - 1; index >= 0; index -= 1) {
      if (worldData[index].births > 0) return worldData[index].name;
    }
    return null;
  }

  function getWorldRanking(
    toutaiRecords: ToutaiRecord[],
    userId: string,
  ): {
    numberOfStillbirthsRank: number;
    birthResultsRank: number;
  } {
    const userRecords = toutaiRecords.filter(
      (record) => record.userId === userId,
    );

    if (userRecords.length === 0) {
      return { numberOfStillbirthsRank: -1, birthResultsRank: -1 };
    }

    const sortedByStillbirths = userRecords
      .slice()
      .sort(
        (a, b) => b.numberOfStillbirthsInWorld - a.numberOfStillbirthsInWorld,
      );
    const numberOfStillbirthsRank =
      sortedByStillbirths.findIndex((record) => record.userId === userId) + 1;

    const sortedByBirthResults = userRecords
      .slice()
      .sort(
        (a, b) => b.birthResultsInWorld.length - a.birthResultsInWorld.length,
      );
    const birthResultsRank =
      sortedByBirthResults.findIndex((record) => record.userId === userId) + 1;

    return { numberOfStillbirthsRank, birthResultsRank };
  }

  function trimUsername(username: string): string {
    const maxLength = 10;

    if (username.length <= maxLength) {
      return username;
    } else {
      return username.slice(0, maxLength) + "...";
    }
  }

  async function generateChineseBirthGenderDistributionPieChart(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ) {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html>
<head>
    <title>中国投胎性别分布</title>
    <style>
        ${COMMON_CSS}
        .chart-container {
            width: 800px;
            height: 600px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #genderChart { width: 100%; height: 100%; }
        #legend {
            margin-top: -50px;
            background: rgba(255,255,255,0.8);
            padding: 15px 30px;
            border-radius: 30px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            display: flex;
            gap: 40px;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js"></script>
</head>
<body>
<div class="container">
  <div class="chart-container">
      <div id="genderChart"></div>
      <div id="legend"></div>
  </div>
</div>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)};

    let maleCount = 0;
    let femaleCount = 0;
    birthResultsInChina.forEach(result => {
        if (result.gender === 'male') {
            maleCount++;
        } else if (result.gender === 'female') {
            femaleCount++;
        }
    });

    const totalCount = birthResultsInChina.length;

    var myChart = echarts.init(document.getElementById('genderChart'));

    var option = {
        title: {
            text: \`${username}：投胎中国性别分布\`,
            subtext: \`总数：\${totalCount}\`,
            left: 'center',
            top: 20,
            textStyle: { fontSize: 32, fontWeight: 'bold', color: '#333' },
            subtextStyle: { fontSize: 20, color: '#666' }
        },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'], // 环形图
            center: ['50%', '55%'],
            itemStyle: {
                borderRadius: 10,
                borderColor: '#fff',
                borderWidth: 2
            },
            data: [
                { value: maleCount, name: 'Male', itemStyle: { color: '#5470C6' } },
                { value: femaleCount, name: 'Female', itemStyle: { color: '#EE6666' } }
            ],
            label: {
                show: true,
                position: 'outside',
                formatter: '{b}\\n{d}%',
                fontSize: 24,
                fontWeight: 'bold'
            },
            animation: false,
        }]
    };

    myChart.setOption(option);

    const legend = document.getElementById('legend');
    legend.innerHTML = \`
    <div style="font-size: 24px; display: flex; align-items: center;">
    <span style="display: inline-block; width: 16px; height: 16px; background-color: #5470C6; border-radius: 50%; margin-right: 8px;"></span>
    男孩：\${maleCount}
    </div>
    <div style="font-size: 24px; display: flex; align-items: center;">
    <span style="display: inline-block; width: 16px; height: 16px; background-color: #EE6666; border-radius: 50%; margin-right: 8px;"></span>
    女孩：\${femaleCount}
    </div>
      \`;
</script>
</body>
</html>
`;
    await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const buffer = await page.screenshot({
      type: config.imageType,
      fullPage: true,
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateChineseBirthRankingsTableImage2(
    toutaiRecords: ToutaiRecord[],
    maxLeaderboardDisplayCount: number,
    strings: string,
  ) {
    const stringsArray = strings.split(" ");
    const title = stringsArray[0];
    const th1 = stringsArray[1];
    const th2 = stringsArray[2];
    const th3 = stringsArray[3];
    const type = stringsArray[4];
    const type2 = stringsArray[5];
    const type3 = stringsArray[6];
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>
<div class="container">
    <h1>${title}</h1>
    <table>
        <thead>
        <tr>
            <th width="20%">${th1}</th>
            <th width="50%">${th2}</th>
            <th width="30%">${th3}</th>
        </tr>
        </thead>
        <tbody id="rankingsTableBody">
        </tbody>
    </table>
</div>
<script>
    const toutaiRecords = ${JSON.stringify(toutaiRecords)};

        toutaiRecords.sort((a, b) => {
        const countA = a.${type}.filter(result => result.${type2} === '${type3}').length;
        const countB = b.${type}.filter(result => result.${type2} === '${type3}').length;

        return countB - countA;
    });

    const table = document.getElementById('rankingsTableBody');

    toutaiRecords.slice(0, ${maxLeaderboardDisplayCount}).forEach((record, index) => {
        const count = record.${type}.filter(result => result.${type2} === '${type3}').length;

        const row = table.insertRow(-1);
        const rankCell = row.insertCell(0);
        const usernameCell = row.insertCell(1);
        const countCell = row.insertCell(2);

        rankCell.textContent = index + 1;
        usernameCell.textContent = record.username;
        countCell.textContent = count + ' 次';

        // 前三名增加特殊样式
        if (index === 0) rankCell.style.color = '#FFD700'; // 金
        if (index === 1) rankCell.style.color = '#C0C0C0'; // 银
        if (index === 2) rankCell.style.color = '#CD7F32'; // 铜
        if (index < 3) rankCell.style.fontWeight = 'bold';
    });
</script>
</body>
</html>
`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);
    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    // 获取实际内容高度并截图
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateChineseBirthRankingsTableImage(
    toutaiRecords: ToutaiRecord[],
    maxLeaderboardDisplayCount: number,
    titleAndThString: string,
    typeString: string,
  ) {
    const titleAndTh = titleAndThString.split(" ");
    const title = titleAndTh[0];
    const th1 = titleAndTh[1];
    const th2 = titleAndTh[2];
    const th3 = titleAndTh[3];
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>
<div class="container">
    <h1>${title}</h1>
    <table>
        <thead>
        <tr>
            <th width="20%">${th1}</th>
            <th width="50%">${th2}</th>
            <th width="30%">${th3}</th>
        </tr>
        </thead>
        <tbody id="rankingsTableBody">
        </tbody>
    </table>
</div>

<script>
    const toutaiRecords = ${JSON.stringify(toutaiRecords)};

    toutaiRecords.sort((a, b) => b.${typeString} - a.${typeString});

    const rankingsTableBody = document.getElementById('rankingsTableBody');

    toutaiRecords.slice(0, ${maxLeaderboardDisplayCount}).forEach((record, index) => {
        const row = document.createElement('tr');
        let rankStyle = '';
        if (index === 0) rankStyle = 'color: #FFD700; font-weight: bold; font-size: 22px;';
        if (index === 1) rankStyle = 'color: #C0C0C0; font-weight: bold; font-size: 22px;';
        if (index === 2) rankStyle = 'color: #CD7F32; font-weight: bold; font-size: 22px;';

        row.innerHTML = \`
      <td style="\${rankStyle}">\${index + 1}</td>
      <td>\${record.username}</td>
      <td>\${record.${typeString}} 次</td>
        \`;
        rankingsTableBody.appendChild(row);
    });
</script>

</body>
</html>

`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateBirthRegionHorizontalBarChartRankings(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ) {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="en">
<head>
    <title>中国投胎地区分布</title>
    <meta charSet="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        ${COMMON_CSS}
        .bar {
            display: flex;
            align-items: center;
            margin-bottom: 15px;
        }

        .bar-name {
            width: 80px;
            text-align: right;
            padding-right: 15px;
            font-size: 18px;
            color: #555;
            font-weight: 500;
        }

        .bar-wrapper {
            flex: 1;
            background-color: #F0F2F5;
            border-radius: 10px;
            overflow: hidden;
            height: 24px;
            position: relative;
        }

        .bar-fill {
            background: linear-gradient(90deg, #69C0FF 0%, #1890FF 100%);
            height: 100%;
            border-radius: 10px;
            transition: width 0.5s ease;
        }

        .bar-count {
            display: flex;
            align-items: center;
            width: 120px;
            justify-content: flex-start;
            padding-left: 15px;
        }

        .count {
            font-weight: bold;
            color: #333;
            margin-right: 10px;
            font-size: 18px;
        }

        .percentage {
            color: #888;
            font-size: 14px;
        }
    </style>
</head>
<body>
<div class="container">
    <h1>${username}：中国投胎地区分布</h1>
    <div id="bars" style="margin-top: 30px;"></div>
</div>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)};

    const provinceCounts = {};
    birthResultsInChina.forEach(result => {
        const {province} = result;
        provinceCounts[province] = (provinceCounts[province] || 0) + 1;
    });

    const totalResults = birthResultsInChina.length;

    const sortedProvinces = Object.entries(provinceCounts)
            .sort((a, b) => b[1] - a[1]);

    const barsContainer = document.getElementById('bars');

    sortedProvinces.forEach(([province, count], index) => {
        const percentage = (count / totalResults) * 100;

        const bar = document.createElement('div');
        bar.className = 'bar';

        const barName = document.createElement('div');
        barName.className = 'bar-name';
        barName.textContent = province;

        const barWrapper = document.createElement('div');
        barWrapper.className = 'bar-wrapper';

        const barFill = document.createElement('div');
        barFill.className = 'bar-fill';
        barFill.style.width = \`\${percentage}%\`;
        // 尝试为前几名使用不同的颜色
        if(index < 3) {
             barFill.style.background = 'linear-gradient(90deg, #FF9C6E 0%, #FF4D4F 100%)';
        }

        barWrapper.appendChild(barFill);

        const barCount = document.createElement('div');
        barCount.className = 'bar-count';

        const countElement = document.createElement('span');
        countElement.className = 'count';
        countElement.textContent = \`\${count}\`;

        const percentageElement = document.createElement('span');
        percentageElement.className = 'percentage';
        percentageElement.textContent = \`\${percentage.toFixed(1)}%\`;

        barCount.appendChild(countElement);
        barCount.appendChild(percentageElement);

        bar.appendChild(barName);
        bar.appendChild(barWrapper);
        bar.appendChild(barCount);

        barsContainer.appendChild(bar);
    });
</script>
</body>
</html>
`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateTableImageFromBirthResultsInWorldArrayForUnfortunateDemiseRecords(
    username: string,
    unfortunateDemiseRecordsInWorld: UnfortunateDemiseRecordInWorld[],
  ): Promise<Buffer> {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
   <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Birth Results Table</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>
<div class="container">
    <h1>${username}：世界投胎夭折历史</h1>
    <table id="unfortunateDemiseRecordsInWorldTable">
        <thead>
        <tr>
            <th width="20%">夭折次数</th>
            <th width="40%">地区</th>
            <th width="40%">国家</th>
        </tr>
        </thead>
        <tbody></tbody>
    </table>
</div>

<script>
    const unfortunateDemiseRecordsInWorld = ${JSON.stringify(unfortunateDemiseRecordsInWorld)};
    const tableBody = document.querySelector("#unfortunateDemiseRecordsInWorldTable tbody");

    unfortunateDemiseRecordsInWorld.forEach(result => {
        const row = tableBody.insertRow();
        const indexCell = row.insertCell(0);
        const continentCell = row.insertCell(1);
        const nameCell = row.insertCell(2);

        indexCell.textContent = result.index;
        continentCell.textContent = result.dictContinent;
        nameCell.textContent = result.dictName;
    });
</script>

</body>
</html>

`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateTableImageFromBirthResultsInWorldArray(
    username: string,
    birthResultsInWorld: BirthResultInWorld[],
  ): Promise<Buffer> {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
   <html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Birth Results Table</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>
<div class="container">
    <h1>${username}：世界投胎成功历史</h1>
    <table id="birthResultsTable">
        <thead>
        <tr>
            <th width="20%">投胎次数</th>
            <th width="40%">地区</th>
            <th width="40%">国家</th>
        </tr>
        </thead>
        <tbody></tbody>
    </table>
</div>

<script>
    const birthResultsInWorld = ${JSON.stringify(birthResultsInWorld)};
    const tableBody = document.querySelector("#birthResultsTable tbody");

    birthResultsInWorld.forEach(result => {
        const row = tableBody.insertRow();
        const indexCell = row.insertCell(0);
        const continentCell = row.insertCell(1);
        const nameCell = row.insertCell(2);

        indexCell.textContent = result.index;
        continentCell.textContent = result.dictContinent;
        nameCell.textContent = result.dictName;
    });
</script>

</body>
</html>

`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateTableImageFromBirthResultsInChinaArray(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ): Promise<Buffer> {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
    <html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>投胎中国成功历史</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>
<div class="container">
    <h1>${username}：中国投胎成功历史</h1>
    <table>
        <thead>
        <tr>
            <th>投胎次数</th>
            <th>性别</th>
            <th>省份/地区</th>
            <th>区域</th>
            <th>第几孩</th>
        </tr>
        </thead>
        <tbody></tbody>
    </table>
</div>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)}
    const tableBody = document.querySelector('table tbody');

    birthResultsInChina.forEach((result) => {
        const {index, province, gender, category, order} = result;

        const row = tableBody.insertRow();
        row.insertCell().textContent = index;

        const genderCell = row.insertCell();
        genderCell.textContent = translateGender(gender);
        if(gender === 'male') genderCell.style.color = '#5470C6';
        if(gender === 'female') genderCell.style.color = '#EE6666';

        row.insertCell().textContent = province;
        row.insertCell().textContent = category;
        row.insertCell().textContent = order;
    });

    function translateGender(gender) {
        switch (gender) {
            case 'male':
                return '男';
            case 'female':
                return '女';
            default:
                return gender;
        }
    }
</script>
</body>
</html>

`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateWorldBirthOverviewTableImage(
    username: string,
    analysisResult,
    userRank: number,
    userStillbirthsRank: number,
    numberOfStillbirthsInChina: number,
  ): Promise<Buffer> {
    const { totalCount, dictContinentCounts } = analysisResult;

    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    // 使用 Grid 布局替换表格
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>世界投胎记录总览</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>

<div class="container">
    <h1>世界投胎记录总览</h1>

    <div class="overview-grid">
        <div class="stat-card user-info">
             <span class="stat-label">被查询对象</span>
             <span class="stat-value">${username}</span>
        </div>

        <div class="stat-card">
            <span class="stat-label">成功次数 (排名)</span>
            <span class="stat-value" style="color: #52C41A;">${totalCount} 次 <span style="font-size: 16px; color: #999;">#${userRank}</span></span>
        </div>
        <div class="stat-card">
            <span class="stat-label">夭折次数 (排名)</span>
            <span class="stat-value" style="color: #F5222D;">${numberOfStillbirthsInChina} 次 <span style="font-size: 16px; color: #999;">#${userStillbirthsRank}</span></span>
        </div>

        ${Object.entries(dictContinentCounts)
          .map(
            ([continent, count]) => `
        <div class="stat-card">
            <span class="stat-label">${continent}次数</span>
            <span class="stat-value">${count} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(Number(count)) / totalCount) * 100)}%</span></span>
        </div>
        `,
          )
          .join("")}
    </div>
</div>

</body>
</html>
`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateChinaBirthOverviewTableImage(
    username: string,
    analysisResult,
    userRank: number,
    userStillbirthsRank: number,
    numberOfStillbirthsInChina: number,
  ): Promise<Buffer> {
    const { totalCount, orderCounts, genderCounts, categoryCounts } =
      analysisResult;

    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中国投胎记录总览</title>
    <style>
        ${COMMON_CSS}
    </style>
</head>
<body>
<div class="container">
    <h1>中国投胎记录总览</h1>

    <div class="overview-grid">
        <div class="stat-card user-info">
             <span class="stat-label">被查询对象</span>
             <span class="stat-value">${username}</span>
        </div>
        <div class="stat-card">
            <span class="stat-label">成功次数 (排名)</span>
            <span class="stat-value" style="color: #52C41A;">${totalCount} 次 <span style="font-size: 16px; color: #999;">#${userRank}</span></span>
        </div>
        <div class="stat-card">
            <span class="stat-label">夭折次数 (排名)</span>
            <span class="stat-value" style="color: #F5222D;">${numberOfStillbirthsInChina} 次 <span style="font-size: 16px; color: #999;">#${userStillbirthsRank}</span></span>
        </div>
        <div class="stat-card">
            <span class="stat-label">城镇次数</span>
            <span class="stat-value">${categoryCounts.城镇} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(categoryCounts.城镇) / totalCount) * 100)}%</span></span>
        </div>
         <div class="stat-card">
            <span class="stat-label">城市次数</span>
            <span class="stat-value">${categoryCounts.城市} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(categoryCounts.城市) / totalCount) * 100)}%</span></span>
        </div>
         <div class="stat-card">
            <span class="stat-label">乡村次数</span>
            <span class="stat-value">${categoryCounts.乡村} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(categoryCounts.乡村) / totalCount) * 100)}%</span></span>
        </div>
        <div class="stat-card">
            <span class="stat-label">男孩次数</span>
            <span class="stat-value" style="color: #5470C6;">${genderCounts.male} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(genderCounts.male) / totalCount) * 100)}%</span></span>
        </div>
        <div class="stat-card">
            <span class="stat-label">女孩次数</span>
            <span class="stat-value" style="color: #EE6666;">${genderCounts.female} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(genderCounts.female) / totalCount) * 100)}%</span></span>
        </div>
        <div class="stat-card">
            <span class="stat-label">第一胎次数</span>
            <span class="stat-value">${orderCounts.一} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(orderCounts.一) / totalCount) * 100)}%</span></span>
        </div>
         <div class="stat-card">
            <span class="stat-label">第二胎次数</span>
            <span class="stat-value">${orderCounts.二} 次 <span style="font-size: 16px; color: #999;">${Math.floor((Math.floor(orderCounts.二) / totalCount) * 100)}%</span></span>
        </div>
    </div>
</div>
</body>
</html>
`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateFirstChineseReincarnationRecordTableImage(
    username: string,
    birthResultsInChina: BirthResultInChina[],
  ): Promise<Buffer> {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中国投胎第一次出现表</title>
    <style>
        ${COMMON_CSS}
        .icon {
            vertical-align: middle;
            margin-left: 8px;
            margin-right: 4px;
        }
    </style>
</head>

<body>
<div class="container">
    <h1>${username}：中国投胎第一次出现</h1>
    <table id="birthResultsTable">
        <thead>
        <tr>
            <th>省份/地区</th>
            <th>第一次出现 (投胎次数)</th>
        </tr>
        </thead>
        <tbody>
        </tbody>
    </table>
</div>

<script>
    const birthResultsInChina = ${JSON.stringify(birthResultsInChina)};

    const provinceData = {};

    birthResultsInChina.forEach(result => {
        const { province, index, gender } = result;
        if (!provinceData[province]) {
            provinceData[province] = { maleIndex: null, femaleIndex: null };
        }

        if (gender === 'male' && provinceData[province].maleIndex === null) {
            provinceData[province].maleIndex = index;
        } else if (gender === 'female' && provinceData[province].femaleIndex === null) {
            provinceData[province].femaleIndex = index;
        }
    });

    const tableBody = document.querySelector('#birthResultsTable tbody');

    for (const province in provinceData) {
        const row = document.createElement('tr');
        const provinceCell = document.createElement('td');
        provinceCell.textContent = province;
        row.appendChild(provinceCell);

        const indexCell = document.createElement('td');
        const maleIndex = provinceData[province].maleIndex !== null ? provinceData[province].maleIndex : '-';
        const femaleIndex = provinceData[province].femaleIndex !== null ? provinceData[province].femaleIndex : '-';

        // 优化 SVG 图标
        indexCell.innerHTML = \`
        <span style="margin-right: 20px;">
        <svg width="14" height="14" viewBox="0 0 512 512" fill="#5470C6" class="icon" xmlns="http://www.w3.org/2000/svg"><path d="M435.6 130.4C434.1 131.6 433.2 132.2 432.5 133C399.8 165.7 367.1 198.3 334.4 231C330.9 234.5 330.9 236.7 333.3 240.9C359.6 285.6 366.1 333.4 351.3 382.8C334.3 439.6 297.4 479.3 241.7 500.1C191.9 518.8 142.5 515.4 95.7 490.5C47.7 465 17.2 424.7 5.10003 371.5C-5.19997 326 1.60003 282.6 25.1 242.3C51.8 196.5 91.7 167.9 143.3 156.9C187.9 147.5 230.5 154.6 270 177.9C275.3 181 278 180.5 282.2 176.3C313.6 144.5 345.2 113 376.8 81.5C378.3 80 379.7 78.5 381.9 76.1C379.3 75.9 377.8 75.8 376.4 75.8C358.2 75.7 339.9 76.1 321.8 75.4C300.9 74.6 285.8 57.9 286.1 37.2C286.4 16.8 302.9 0.299974 323.3 0.199974C345.8 -0.100026 368.3 0.0999741 390.9 0.0999741H469.6C496.5 0.0999741 511.9 15.5 511.9 42.4V185.8C511.9 210 495.2 226.6 471.8 226C453.8 225.6 437.2 210.1 436.6 192.1C435.9 173.5 436.3 154.9 436.2 136.3C435.9 134.6 435.7 132.9 435.6 130.4ZM178.6 435.8C235.1 436.5 281.6 390.7 282.7 333.4C283.8 277 237.2 229.7 179.9 229.1C123.2 228.5 76.6 274.9 76.1 332.4C75.7 388.4 121.9 435 178.6 435.8Z"></path></svg>
        \${maleIndex}
        </span>
        <span>
        <svg width="14" height="14" viewBox="0 0 297 512" fill="#EE6666" class="icon" xmlns="http://www.w3.org/2000/svg"><path d="M226.24 355.44H182.32V292C247.44 276.48 296.08 217.92 296.08 148.08C296.16 66.4 229.68 0 148.08 0C66.48 0 0 66.4 0 148.08C0 217.92 48.64 276.48 113.76 292V355.44H69.84C50.96 355.44 35.6 370.8 35.6 389.68C35.6 408.56 50.96 423.92 69.84 423.92H113.76V477.68C113.76 496.56 129.12 511.92 148 511.92C166.88 511.92 182.24 496.56 182.24 477.68V423.92H226.16C245.04 423.92 260.4 408.56 260.4 389.68C260.411 385.187 259.535 380.737 257.823 376.583C256.111 372.429 253.596 368.654 250.423 365.474C247.25 362.293 243.481 359.77 239.331 358.048C235.181 356.326 230.733 355.44 226.24 355.44ZM68.56 148.08C68.56 104.24 104.24 68.56 148.08 68.56C191.92 68.56 227.6 104.24 227.6 148.08C227.6 191.92 191.92 227.6 148.08 227.6C104.24 227.6 68.56 191.92 68.56 148.08Z"></path></svg>
        \${femaleIndex}
        </span>\`;
        row.appendChild(indexCell);

        tableBody.appendChild(row);
    }
</script>
</body>

</html>


`;
    await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const buffer = await page.screenshot({
      type: config.imageType,
      clip: { x: 0, y: 0, width: 800, height: bodyHeight },
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function processTargetUser(
    session: any,
    userId: string,
    username: string,
    targetUser: string,
  ): Promise<{
    targetUserRecord: ToutaiRecord[];
    targetUserId: string;
  }> {
    let targetUserRecord: ToutaiRecord[] = [];
    let targetUserId: string = userId;
    let targetUsername = username;

    if (!targetUser) {
      targetUserRecord = await ctx.database.get("toutai_records", { userId });
    } else {
      targetUser = await replaceAtTags(session, targetUser);

      if (
        isQQOfficialRobotMarkdownTemplateEnabled &&
        session.platform === "qq"
      ) {
        targetUserRecord = await ctx.database.get("toutai_records", {
          username: targetUser,
        });

        if (targetUserRecord.length === 0) {
          targetUserRecord = await ctx.database.get("toutai_records", {
            userId: targetUser,
          });

          if (targetUserRecord.length !== 0) {
            targetUserId = targetUser;
          }
        } else {
          targetUserId = targetUserRecord[0].userId;
        }
      } else {
        const userIdRegex = /<at id="([^"]+)"(?: name="([^"]+)")?\/>/;
        const match = targetUser.match(userIdRegex);
        targetUserId = match?.[1] ?? userId;
        targetUsername = match?.[2] ?? username;

        if (targetUserId === userId) {
          targetUserRecord = await ctx.database.get("toutai_records", {
            userId: targetUser,
          });

          if (targetUserRecord.length !== 0) {
            targetUserId = targetUser;
          }
        } else {
          targetUserRecord = await ctx.database.get("toutai_records", {
            userId: targetUserId,
          });
        }
      }
    }

    return { targetUserRecord, targetUserId };
  }

  function getChinaStillbirthsRanking(
    toutaiRecords: ToutaiRecord[],
    userId: string,
  ): number {
    const userRecords = toutaiRecords.filter(
      (record) => record.userId === userId,
    );

    userRecords.sort(
      (a, b) => b.numberOfStillbirthsInChina - a.numberOfStillbirthsInChina,
    );

    return userRecords.findIndex((record) => record.userId === userId) + 1;
  }

  function getUserRankInChinaBirthResults(
    toutaiRecords: ToutaiRecord[],
    userId: string,
  ): number {
    const sortedRecords = toutaiRecords
      .slice()
      .sort(
        (a, b) => b.birthResultsInChina.length - a.birthResultsInChina.length,
      );
    return sortedRecords.findIndex((record) => record.userId === userId) + 1;
  }

  function analyzeWorldBirthResults(birthResultsInWorld: BirthResultInWorld[]) {
    const totalCount = birthResultsInWorld.length;
    const dictContinentCounts: { [key: string]: number } = {
      非洲: 0,
      亚洲: 0,
      欧洲: 0,
      北美洲: 0,
      南美洲: 0,
      大洋洲: 0,
      南极洲: 0,
    };

    for (const result of birthResultsInWorld) {
      if (dictContinentCounts.hasOwnProperty(result.dictContinent)) {
        dictContinentCounts[result.dictContinent]++;
      }
    }

    return { totalCount, dictContinentCounts };
  }

  function analyzeChinaBirthResults(birthResultsInChina: BirthResultInChina[]) {
    const totalCount = birthResultsInChina.length;

    const orderCounts = {
      一: 0,
      二: 0,
      三: 0,
      四: 0,
      五及以上: 0,
    };

    const genderCounts = {
      male: 0,
      female: 0,
    };

    const categoryCounts = {
      城镇: 0,
      城市: 0,
      乡村: 0,
    };

    for (const result of birthResultsInChina) {
      // 统计 order
      switch (result.order) {
        case "一":
          orderCounts.一++;
          break;
        case "二":
          orderCounts.二++;
          break;
        case "三":
          orderCounts.三++;
          break;
        case "四":
          orderCounts.四++;
          break;
        default:
          orderCounts["五及以上"]++;
          break;
      }

      // 统计 gender
      if (result.gender === "male") {
        genderCounts.male++;
      } else {
        genderCounts.female++;
      }

      // 统计 category
      switch (result.category) {
        case "城镇":
          categoryCounts.城镇++;
          break;
        case "城市":
          categoryCounts.城市++;
          break;
        case "乡村":
          categoryCounts.乡村++;
          break;
      }
    }

    return {
      totalCount,
      orderCounts,
      genderCounts,
      categoryCounts,
    };
  }

  async function replaceAtTags(session, content: string): Promise<string> {
    // 正则表达式用于匹配 at 标签
    const atRegex = /<at id="(\d+)"(?: name="([^"]*)")?\/>/g;

    // 匹配所有 at 标签
    let match;
    while ((match = atRegex.exec(content)) !== null) {
      const userId = match[1];
      const name = match[2];

      // 如果 name 不存在，根据 userId 获取相应的 name
      if (!name) {
        let guildMember;
        try {
          guildMember = await session.bot.getGuildMember(
            session.guildId,
            userId,
          );
        } catch (error) {
          guildMember = {
            user: {
              name: "未知用户",
            },
          };
        }

        // 替换原始的 at 标签
        const newAtTag = `<at id="${userId}" name="${guildMember.user.name}"/>`;
        content = content.replace(match[0], newAtTag);
      }
    }

    return content;
  }

  function translateGender(gender: string): string {
    switch (gender) {
      case "male":
        return "男";
      case "female":
        return "女";
      default:
        return gender;
    }
  }

  function calculateTimeDifference(
    previousTimestamp: number,
    currentTimestamp: number,
  ): number {
    return (currentTimestamp - previousTimestamp) / 1000;
  }

  function simulateRebirth(neonatalMortalityRate: number): boolean {
    // 新生儿死亡率，以小数形式表示（例如，3.19% 为 0.0319）
    neonatalMortalityRate = neonatalMortalityRate / 100;

    // 新生儿的命运
    const randomValue = Math.random();

    if (randomValue < neonatalMortalityRate) {
      return false;
    } else {
      return true;
    }
  }

  async function generateWorldMap(
    birthResultInWorld: BirthResultInWorld,
  ): Promise<Buffer> {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="zh">
<head>
    <title>绘制世界地图</title>
    <meta charSet="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- 引入 ECharts 文件 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js" integrity="sha512-k37wQcV4v2h6jgYf5IUz1MoSKPpDs630XGSmCaCCOXxy2awgAWKHGZWr9nMyGgk3IOxA1NxdkN8r1JHgkUtMoQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <style>
      body { margin: 0; background: #E8E8E8; }
    </style>
</head>
<body>
<div id="main" style="width: 800px;height:400px;"></div>

<script>
    const myChart = echarts.init(document.getElementById('main'));
    const world = ${JSON.stringify(world)};
    echarts.registerMap('world', world);

            const option = {
                backgroundColor: '#E8E8E8',
                geo: {
                    map: 'world',
                    roam: true,
                    // zoom: 1.2,
                    zoom: 2.0,
                    label: {
                        emphasis: {
                            show: false,
                        }
                    },
                    center: ${JSON.stringify(birthResultInWorld.center)},
                    tooltip: {
                        show: true
                    },
                    // silent: true,
                    itemStyle: {
                        normal: {
                            areaColor: '#CFCFCF',
                            borderColor: '#111'
                        },
                        emphasis: {
                            areaColor: '#2a333d'
                        }
                    }
                },
                series: {
                    type: 'custom',
                    coordinateSystem: 'geo',
                    geoIndex: 0,
                    zlevel: 1,
                    data: [
                       ${JSON.stringify(birthResultInWorld.coordinate)}
                    ],
                    renderItem(params, api) {
                        const coord = api.coord([
                            api.value(0, params.dataIndex),
                            api.value(1, params.dataIndex)
                        ]);
                        const circles = [];
                        for (let i = 0; i < 5; i++) {
                            circles.push({
                                type: 'circle',
                                shape: {
                                    cx: 0,
                                    cy: 0,
                                    r: 30
                                },
                                style: {
                                    stroke: 'red',
                                    fill: 'none',
                                    lineWidth: 2
                                },
                                // Ripple animation
                                keyframeAnimation: {
                                    duration: 4000,
                                    loop: true,
                                    delay: (-i / 4) * 4000,
                                    keyframes: [
                                        {
                                            percent: 0,
                                            scaleX: 0,
                                            scaleY: 0,
                                            style: {
                                                opacity: 1
                                            }
                                        },
                                        {
                                            percent: 1,
                                            scaleX: 1,
                                            scaleY: 0.4,
                                            style: {
                                                opacity: 0
                                            }
                                        }
                                    ]
                                }
                            });
                        }
                        return {
                            type: 'group',
                            x: coord[0],
                            y: coord[1],
                            children: [
                                ...circles,
                                {
                                    type: 'path',
                                    shape: {
                                        d: 'M16 0c-5.523 0-10 4.477-10 10 0 10 10 22 10 22s10-12 10-22c0-5.523-4.477-10-10-10zM16 16c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z',
                                        x: -10,
                                        y: -35,
                                        width: 20,
                                        height: 40
                                    },
                                    style: {
                                        fill: 'red'
                                    },
                                    // Jump animation.
                                    keyframeAnimation: {
                                        duration: 1000,
                                        loop: true,
                                        delay: Math.random() * 1000,
                                        keyframes: [
                                            {
                                                y: -10,
                                                percent: 0.5,
                                                easing: 'cubicOut'
                                            },
                                            {
                                                y: 0,
                                                percent: 1,
                                                easing: 'bounceOut'
                                            }
                                        ]
                                    }
                                }
                            ]
                        };
                    }
                }
            };
            myChart.setOption(option);
</script>
</body>
</html>
`;
    await page.setViewport({ width: 800, height: 400, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const buffer = await page.screenshot({
      type: config.imageType,
      fullPage: true,
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function generateChinaMap(
    birthResults: BirthResultInChina[],
    birthResult: BirthResultInChina,
  ): Promise<Buffer> {
    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const htmlContent = `
<html lang="zh">
<head>
    <title>绘制中国地图</title>
    <meta charSet="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
         body {
          background-color: #F5F3EF;
          margin: 0;
      }
    </style>
    <!-- 引入 ECharts 文件 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js" integrity="sha512-k37wQcV4v2h6jgYf5IUz1MoSKPpDs630XGSmCaCCOXxy2awgAWKHGZWr9nMyGgk3IOxA1NxdkN8r1JHgkUtMoQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
</head>
<body>
<div id="main" style="width: 800px;height:674px;"></div>

<script>
    const mapName = 'china';
    const provinceMap = {};

    const totalPopulation = ${totalPopulation}
    const birthResults = ${JSON.stringify(birthResults)};

    birthResults.forEach(result => {
        if (provinceMap[result.province]) {
            provinceMap[result.province] += result.probability;
        } else {
            provinceMap[result.province] = result.probability;
        }
    });

    const dataList = Object.entries(provinceMap).map(([name, value]) => ({
        name,
        value
    }));

    const topNumber = dataList.length > 0 ? Math.max(...dataList.map(item => item.value)) : 0;
    const bottomNumber = dataList.length > 0 ? Math.min(...dataList.map(item => item.value)) : 0;

    const data = ${JSON.stringify(ChinaData)};
    const myChart = echarts.init(document.getElementById('main'));
    echarts.registerMap(mapName, data);
    const currentProvince = '${birthResult.province}';
    const markPointData = currentProvince
        ? data.features.find(
            feature => feature.properties.name === currentProvince
        )
        : null;
    const option = {
        backgroundColor: '#F5F3EF',
        visualMap: {
            min: 0,
            max: 5,
            left: 'left',
            top: 'bottom',
            text: [topNumber.toFixed(2) + '%', bottomNumber.toFixed(2) + '%'],
            inRange: {
                color: ['#f5e1d6', '#ff4f04']
            },
            show: false
        },
        geo: {
            map: 'china',
            roam: false,
            zoom: 1.23,
            label: {
                normal: {
                    show: true,
                    fontSize: '10',
                    color: '#181716',
                    fontWeight: 'medium'
                },
                emphasis: {
                    show: true,
                    color: '#181716'
                }
            },
            itemStyle: {
                normal: {
                    borderColor: '#bebfc0',
                    areaColor: '#fcfcfd'
                },
                emphasis: {
                    areaColor: '#afd8af'
                }
            }
        },
        series: [
            {
                name: '人口',
                type: 'map',
                geoIndex: 0,
                data: dataList,
                select: {
                    disabled: true
                },
                markPoint: {
                    symbol: 'pin',
                    symbolSize: 30,
                    animationDuration: 0,
                    itemStyle: {
                        color: '#01ca78'
                    },
                    data: markPointData
                        ? [
                            {
                                name: currentProvince,
                                coord: markPointData.properties.cp
                            }
                        ]
                        : []
                }
            }
        ]
    };
    myChart.setOption(option);
      const echartsMapClick = () => {};
        myChart.getZr().on('click', params => {
      if (params.target) {
        myChart.on('click', echartsMapClick);
      }
    });
</script>
</body>
</html>
`;
    await page.setViewport({ width: 800, height: 674, deviceScaleFactor: 2 });
    await page.goto(pageGotoFilePath);

    await page.setContent(h.unescape(htmlContent), { waitUntil: "load" });
    const buffer = await page.screenshot({
      type: config.imageType,
      fullPage: true,
    });

    await page.close();
    await context.close();

    return buffer;
  }

  async function updateNameInPlayerRecord(
    session: any,
    userId: string,
    username: string,
  ): Promise<void> {
    const userRecord = await ctx.database.get("toutai_records", { userId });

    if (userRecord.length === 0) {
      await ctx.database.create("toutai_records", {
        userId,
        username,
      });
      return;
    }

    const existingRecord = userRecord[0];
    let isChange = false;

    if (
      username !== existingRecord.username &&
      (!(
        isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq"
      ) ||
        (isQQOfficialRobotMarkdownTemplateEnabled &&
          session.platform === "qq" &&
          config.isUsingUnifiedKoishiBuiltInUsername))
    ) {
      existingRecord.username = username;
      isChange = true;
    }

    if (isChange) {
      await ctx.database.set(
        "toutai_records",
        { userId },
        {
          username: existingRecord.username,
        },
      );
    }
  }

  async function getSessionUserName(session: any): Promise<string> {
    let sessionUserName = session.username;

    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq") {
      const [user] = await ctx.database.get("user", { id: session.user.id });
      if (config.isUsingUnifiedKoishiBuiltInUsername && user.name) {
        sessionUserName = user.name;
      } else {
        let userRecord = await ctx.database.get("toutai_records", {
          userId: session.userId,
        });

        if (userRecord.length === 0) {
          await ctx.database.create("toutai_records", {
            userId: session.userId,
            username: sessionUserName,
          });

          userRecord = await ctx.database.get("toutai_records", {
            userId: session.userId,
          });
        }
        sessionUserName = userRecord[0].username;
      }
    }

    return sessionUserName;
  }

  function translateGenderChild(gender: string): string {
    switch (gender) {
      case "male":
        return "男孩";
      case "female":
        return "女孩";
      default:
        return gender;
    }
  }

  function isSpecialProvince(province: string): boolean {
    return ["xiang_gang", "ao_men", "tai_wan"].includes(province);
  }

  function simulateBirthInChina(): BirthResultInChina {
    const randomNumber = Math.random() * totalPopulation;

    let cumulativePopulation = 0;
    for (const region of birthrateDetailedData) {
      if (region.name === "national") continue;
      for (const category of ["town", "city", "countryside"] as const) {
        for (const order of [
          "one",
          "two",
          "three",
          "four",
          "fivePlus",
        ] as const) {
          for (const gender of ["male", "female"] as const) {
            let population = region[category][order][gender];
            if (!isSpecialProvince(region.name)) {
              population *= 10;
            }
            cumulativePopulation += population;
            if (cumulativePopulation > randomNumber) {
              const probability = population / totalPopulation;
              return {
                id: region.id,
                province: region.displayName,
                gender: gender,
                category:
                  category === "town"
                    ? "城镇"
                    : category === "city"
                      ? "城市"
                      : "乡村",
                order:
                  order === "one"
                    ? "一"
                    : order === "two"
                      ? "二"
                      : order === "three"
                        ? "三"
                        : order === "four"
                          ? "四"
                          : "五及以上",
                probability: probability,
              };
            }
          }
        }
      }
    }

    return {
      id: 0,
      province: "",
      gender: "",
      category: "",
      order: "",
      probability: 0,
    };
  }

  function parseMarkdownCommands(markdownCommands: string): string[] {
    return markdownCommands
      .split(" ")
      .filter((command) => command.trim() !== "");
  }

  async function createButtons(session: any, markdownCommands: string) {
    const commands = parseMarkdownCommands(markdownCommands);

    const mapCommandToDataValue = (command: string) => {
      const commandMappings: Record<string, string> = {
        投胎中国: "toutai.投胎中国",
        投胎世界: "toutai.投胎世界",
        改名: "toutai.改名",
        中国投胎记录: "toutai.中国投胎记录",
        中国投胎成功历史: "toutai.中国投胎记录.成功历史",
        中国投胎地区分布: "toutai.中国投胎记录.地区分布",
        中国投胎性别分布: "toutai.中国投胎记录.性别分布",
        中国投胎第一次出现记录: "toutai.中国投胎记录.第一次出现",
        中国投胎记录总览: "toutai.中国投胎记录.总览",
        世界投胎记录: "toutai.世界投胎记录",
        世界投胎成功历史: "toutai.世界投胎记录.成功历史",
        世界投胎夭折历史: "toutai.世界投胎记录.夭折历史",
        世界投胎记录总览: "toutai.世界投胎记录.总览",
        投胎中国排行榜: "toutai.中国投胎排行榜",
        中国投胎成功次数: "toutai.中国投胎排行榜.成功次数",
        中国投胎夭折次数: "toutai.中国投胎排行榜.夭折次数",
        中国投胎男孩次数: "toutai.中国投胎排行榜.男孩次数",
        中国投胎女孩次数: "toutai.中国投胎排行榜.女孩次数",
        投胎世界排行榜: "toutai.世界投胎排行榜",
        世界投胎成功次数: "toutai.世界投胎排行榜.成功次数",
        世界投胎夭折次数: "toutai.世界投胎排行榜.夭折次数",
        世界投胎亚洲次数: "toutai.世界投胎排行榜.亚洲",
        世界投胎欧洲次数: "toutai.世界投胎排行榜.欧洲",
        世界投胎非洲次数: "toutai.世界投胎排行榜.非洲",
        世界投胎北美洲次数: "toutai.世界投胎排行榜.北美洲",
        世界投胎南极洲次数: "toutai.世界投胎排行榜.南极洲",
        世界投胎大洋洲次数: "toutai.世界投胎排行榜.大洋洲",
        世界投胎南美洲次数: "toutai.世界投胎排行榜.南美洲",
      };

      return commandMappings[command];
    };

    const createButton = async (command: string) => {
      let dataValue = mapCommandToDataValue(command);
      if (dataValue === undefined) {
        dataValue = command;
      }

      return {
        render_data: {
          label: command,
          visited_label: command,
          style: 1,
        },
        action: {
          type: 2,
          permission: { type: 2 },
          data: `${dataValue}`,
          enter: !["改名"].includes(command),
        },
      };
    };

    const buttonPromises = commands.map(createButton);
    return Promise.all(buttonPromises);
  }

  let sentMessages = [];
  const msgSeqMap: { [msgId: string]: number } = {};

  async function sendMessage(
    session: any,
    message: any,
    markdownCommands: string,
    numberOfMessageButtonsPerRow?: number,
    isAt: boolean = true,
    isButton: boolean = false,
  ): Promise<void> {
    numberOfMessageButtonsPerRow =
      numberOfMessageButtonsPerRow || config.numberOfMessageButtonsPerRow;
    const { bot, channelId, userId } = session;
    const username = await getSessionUserName(session);

    let messageId;
    let isPushMessageId = false;
    if (isQQOfficialRobotMarkdownTemplateEnabled && session.platform === "qq") {
      const msgSeq = msgSeqMap[session.messageId] || 10;
      msgSeqMap[session.messageId] = msgSeq + 100;
      const buttons = await createButtons(session, markdownCommands);

      const rows = [];
      let row = { buttons: [] };
      buttons.forEach((button, index) => {
        row.buttons.push(button);
        if (
          row.buttons.length === 5 ||
          index === buttons.length - 1 ||
          row.buttons.length === numberOfMessageButtonsPerRow
        ) {
          rows.push(row);
          row = { buttons: [] };
        }
      });

      if (!isButton && config.isTextToImageConversionEnabled) {
        let lines = message.toString().split("\n");
        const isOnlyImgTag =
          lines.length === 1 && lines[0].trim().startsWith("<img");
        if (isOnlyImgTag) {
          [messageId] = await session.send(message);
        } else {
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            lines = [`@${username}`, ...lines];
          }
          const modifiedMessage = lines
            .map((line) => {
              if (line.trim() !== "" && !line.includes("<img")) {
                return `# ${line}`;
              } else {
                return line + "\n";
              }
            })
            .join("\n");
          ctx.inject(["markdownToImage"], async (ctx) => {
            const imageBuffer =
              await ctx.markdownToImage.convertToImage(modifiedMessage);
            [messageId] = await session.send(
              h.image(imageBuffer, `image/${config.imageType}`),
            );
          });
        }
        if (config.retractDelay !== 0) {
          isPushMessageId = true;
          sentMessages.push(messageId);
        }

        if (config.isTextToImageConversionEnabled && markdownCommands !== "") {
          await sendMessage(
            session,
            "",
            markdownCommands,
            numberOfMessageButtonsPerRow,
            false,
            true,
          );
        }
      } else if (isButton && config.isTextToImageConversionEnabled) {
        const result = await session.qq.sendMessage(session.channelId, {
          msg_type: 2,
          msg_id: session.messageId,
          msg_seq: msgSeq,
          content: "",
          markdown: {
            custom_template_id: config.customTemplateId,
            params: [
              {
                key: config.key,
                values: [`<@${userId}>`],
              },
            ],
          },
          keyboard: {
            content: {
              rows: rows.slice(0, 5),
            },
          },
        });
        messageId = result.id;
      } else {
        if (message.attrs?.src || message.includes("<img")) {
          [messageId] = await session.send(message);
        } else {
          message = message.replace(/\n/g, "\r");
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            message = `<@${userId}>\r${message}`;
          }
          const result = await session.qq.sendMessage(session.channelId, {
            msg_type: 2,
            msg_id: session.messageId,
            msg_seq: msgSeq,
            content: "111",
            markdown: {
              custom_template_id: config.customTemplateId,
              params: [
                {
                  key: config.key,
                  values: [`${message}`],
                },
              ],
            },
            keyboard: {
              content: {
                rows: rows.slice(0, 5),
              },
            },
          });

          messageId = result.id;
        }
      }
    } else {
      if (config.isTextToImageConversionEnabled) {
        let lines = message.toString().split("\n");
        const isOnlyImgTag =
          lines.length === 1 && lines[0].trim().startsWith("<img");
        if (isOnlyImgTag) {
          [messageId] = await session.send(message);
        } else {
          if (config.shouldPrefixUsernameInMessageSending && isAt) {
            lines = [`@${username}`, ...lines];
          }
          const modifiedMessage = lines
            .map((line) => {
              if (line.trim() !== "" && !line.includes("<img")) {
                return `# ${line}`;
              } else {
                return line + "\n";
              }
            })
            .join("\n");
          ctx.inject(["markdownToImage"], async (ctx) => {
            const imageBuffer =
              await ctx.markdownToImage.convertToImage(modifiedMessage);
            [messageId] = await session.send(
              h.image(imageBuffer, `image/${config.imageType}`),
            );
          });
        }
      } else {
        if (config.shouldPrefixUsernameInMessageSending && isAt) {
          message = `${h.at(userId)} ~\n${message}`;
        }
        [messageId] = await session.send(message);
      }
    }

    if (config.retractDelay === 0) return;
    if (!isPushMessageId) {
      sentMessages.push(messageId);
    }

    if (sentMessages.length > 1) {
      const oldestMessageId = sentMessages.shift();
      setTimeout(async () => {
        await bot.deleteMessage(channelId, oldestMessageId);
      }, config.retractDelay * 1000);
    }
  }
}
