import type { EntityHit, IndustryCategory } from "../types.js";

export const highValueKeywords = [
  "发布会",
  "系统更新",
  "召回",
  "涨价",
  "降价",
  "爆料",
  "开售",
  "事故",
  "智驾",
  "AI",
  "芯片",
  "半导体",
  "晶体管",
  "韬定律",
  "τ定律",
  "逻辑折叠",
  "技术突破",
  "产业新原则",
  "财报",
  "规则调整",
  "流量",
  "AIGC",
  "折叠屏",
  "影像",
  "端侧",
  "大模型",
  "补能",
  "车机"
];

export const lowValueKeywords = [
  "手机壳",
  "保护壳",
  "钢化膜",
  "贴膜",
  "充电头",
  "充电器",
  "数据线",
  "移动电源",
  "配色",
  "联名款",
  "周边",
  "小家电",
  "电饭煲",
  "吹风机",
  "电动牙刷",
  "游戏皮肤",
  "角色PV",
  "角色 pv",
  "预告片"
];

const categoryKeywords: Record<IndustryCategory, string[]> = {
  digital: [
    "手机",
    "平板",
    "耳机",
    "手表",
    "相机",
    "镜头",
    "路由器",
    "处理器",
    "iPhone",
    "iOS",
    "Android",
    "ColorOS",
    "OriginOS",
    "MagicOS",
    "HyperOS",
    "HarmonyOS",
    "芯片",
    "半导体",
    "晶体管",
    "韬定律",
    "τ定律",
    "逻辑折叠",
    "摩尔",
    "麒麟",
    "影像",
    "折叠屏",
    "发布会",
    "发布",
    "AI手机",
    "端侧AI",
    "Apple",
    "Apple Intelligence",
    "App Store",
    "Google",
    "Android Auto",
    "Pixel",
    "Gemini",
    "WWDC",
    "OPPO",
    "vivo",
    "荣耀",
    "华为",
    "小米",
    "三星"
  ],
  media: [
    "B站",
    "微博",
    "抖音",
    "小红书",
    "视频号",
    "UP主",
    "创作者",
    "流量",
    "平台规则",
    "MCN",
    "变现",
    "AIGC",
    "爆款"
  ],
  auto: [
    "新能源车",
    "智能驾驶",
    "智驾",
    "座舱",
    "车机",
    "补能",
    "SUV",
    "OTA",
    "交付",
    "小米汽车",
    "特斯拉",
    "比亚迪",
    "蔚来",
    "理想",
    "小鹏",
    "问界",
    "极氪",
    "智界",
    "长城",
    "哈弗",
    "福特",
    "现代集团",
    "鸿蒙智行",
    "车企"
  ],
  mixed: [],
  unknown: []
};

const entityCatalog: EntityHit[] = [
  { name: "苹果", type: "brand", aliases: ["Apple", "iPhone", "iOS", "WWDC"] },
  { name: "Google", type: "brand", aliases: ["Android", "Pixel", "Gemini"] },
  { name: "小米", type: "brand", aliases: ["Xiaomi", "小米汽车", "SU7", "HyperOS"] },
  { name: "OPPO", type: "brand", aliases: ["ColorOS", "Find"] },
  { name: "vivo", type: "brand", aliases: ["OriginOS", "X Fold", "X 系列"] },
  { name: "荣耀", type: "brand", aliases: ["Honor", "MagicOS"] },
  { name: "华为", type: "brand", aliases: ["Huawei", "HarmonyOS", "问界", "智界", "韬定律", "τ定律", "何庭波", "麒麟"] },
  { name: "三星", type: "brand", aliases: ["Samsung", "Galaxy"] },
  { name: "B站", type: "platform", aliases: ["哔哩哔哩", "Bilibili", "UP主"] },
  { name: "微博", type: "platform", aliases: ["Weibo"] },
  { name: "抖音", type: "platform", aliases: ["Douyin"] },
  { name: "小红书", type: "platform", aliases: ["RED"] },
  { name: "特斯拉", type: "brand", aliases: ["Tesla", "FSD"] },
  { name: "比亚迪", type: "brand", aliases: ["BYD"] },
  { name: "蔚来", type: "brand", aliases: ["NIO"] },
  { name: "理想", type: "brand", aliases: ["Li Auto"] },
  { name: "小鹏", type: "brand", aliases: ["XPeng"] },
  { name: "问界", type: "brand", aliases: ["AITO"] },
  { name: "极氪", type: "brand", aliases: ["Zeekr"] },
  { name: "AI 手机", type: "technology", aliases: ["AI手机", "端侧AI", "AI 影像"] },
  { name: "半导体突破", type: "technology", aliases: ["半导体", "晶体管", "韬定律", "τ定律", "逻辑折叠", "先进制程"] },
  { name: "智能驾驶", type: "technology", aliases: ["智驾", "NOA", "辅助驾驶"] }
];

export function detectCategory(text: string): IndustryCategory {
  if (isNoiseContent(text)) return "unknown";

  const scores: Record<IndustryCategory, number> = {
    digital: 0,
    media: 0,
    auto: 0,
    mixed: 0,
    unknown: 0
  };

  for (const category of ["digital", "media", "auto"] as const) {
    for (const keyword of categoryKeywords[category]) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) scores[category] += 1;
    }
  }

  const sorted: Array<"digital" | "media" | "auto"> = ["digital", "media", "auto"];
  sorted.sort((a, b) => scores[b] - scores[a]);
  const first = sorted[0] || "digital";
  const second = sorted[1] || "media";
  if (scores[first] === 0) return "unknown";
  if (scores[second] >= 2 && scores[first] - scores[second] <= 2) return "mixed";
  return first;
}

export function detectTags(text: string, category: IndustryCategory): string[] {
  const tags = new Set<string>();
  if (category === "digital" || category === "mixed") tags.add("数码");
  if (category === "media" || category === "mixed") tags.add("自媒体");
  if (category === "auto" || category === "mixed") tags.add("汽车");

  const tagMap: Record<string, string[]> = {
    "AI手机": ["AI手机", "AI 手机", "端侧AI", "AI 影像"],
    "智驾": ["智驾", "智能驾驶", "NOA", "辅助驾驶"],
    "系统更新": ["系统更新", "推送", "升级", "iOS", "Android", "HarmonyOS", "ColorOS", "OriginOS", "MagicOS", "HyperOS"],
    "半导体突破": ["半导体", "晶体管", "韬定律", "τ定律", "逻辑折叠", "先进制程", "麒麟芯片", "时间缩微", "摩尔"],
    "发布会": ["发布会", "定档", "发布", "开售"],
    "影像": ["影像", "相机", "长焦", "传感器"],
    "平台规则": ["平台规则", "流量规则", "创作激励", "推荐机制", "限流"],
    "争议": ["争议", "吐槽", "事故", "召回", "维权"],
    "选题机会": ["怎么做", "方法论", "爆款", "用户痛点", "对比"]
  };

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()))) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

export function detectEntities(text: string): EntityHit[] {
  const hits: EntityHit[] = [];
  for (const entity of entityCatalog) {
    const terms = [entity.name, ...entity.aliases];
    if (terms.some((term) => text.toLowerCase().includes(term.toLowerCase()))) {
      hits.push(entity);
    }
  }
  return hits;
}

export function matchesInterest(text: string): boolean {
  if (isNoiseContent(text)) return false;
  const lower = text.toLowerCase();
  const hasHighValueSignal = highValueKeywords.some((keyword) => lower.includes(keyword.toLowerCase()));
  if (lowValueKeywords.some((keyword) => lower.includes(keyword.toLowerCase())) && !hasHighValueSignal) return false;
  return detectCategory(text) !== "unknown" || highValueKeywords.some((keyword) => text.toLowerCase().includes(keyword.toLowerCase()));
}

export function isNoiseContent(text: string): boolean {
  const value = text.toLowerCase();
  const gameNoise = [
    "王者荣耀",
    "阴阳师",
    "火影忍者",
    "勘九郎",
    "角色pv",
    "角色 pv",
    "赛季前瞻",
    "手游",
    "cg丨",
    "cv：",
    "niko"
  ];
  const industrySignals = [
    "平板",
    "汽车",
    "新能源",
    "智能驾驶",
    "智驾",
    "芯片",
    "半导体",
    "晶体管",
    "逻辑折叠",
    "韬定律",
    "τ定律",
    "系统",
    "平台规则",
    "创作者",
    "自媒体",
    "流量",
    "内容创作",
    "aigc"
  ];
  const lowValueWithoutSignal =
    lowValueKeywords.some((keyword) => value.includes(keyword.toLowerCase())) &&
    !highValueKeywords.some((keyword) => value.includes(keyword.toLowerCase())) &&
    !industrySignals.some((keyword) => value.includes(keyword.toLowerCase()));
  return (
    (gameNoise.some((keyword) => value.includes(keyword.toLowerCase())) &&
      !industrySignals.some((keyword) => value.includes(keyword.toLowerCase()))) ||
    lowValueWithoutSignal
  );
}
