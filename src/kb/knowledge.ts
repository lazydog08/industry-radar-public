import type { EntityHit, IndustryCategory, SourceItem } from "../types.js";

export interface KnowledgeDraft {
  summary: string;
  whatHappened: string;
  whyItMatters: string;
  creatorImpact: string;
  contentAngle: string;
  coverAngle: string;
  worthFollowing: boolean;
}

export function buildKnowledgeDraft(item: SourceItem, tags: string[], entities: EntityHit[]): KnowledgeDraft {
  const entityText = entities.map((entity) => entity.name).slice(0, 4).join("、") || "相关主体";
  const categoryLabel = categoryName(item.category);
  const raw = item.summaryRaw ? `公开摘要提到：${clip(item.summaryRaw, 140)}` : "目前公开信息主要来自标题和来源元数据。";
  const keywordHint = tags.length > 0 ? `系统识别到 ${tags.slice(0, 5).join("、")} 等信号。` : "尚未识别到明确的行业标签。";
  const sourceNote = `来源为 ${item.source}，发布时间标记为 ${formatDate(item.publishedAt)}。`;

  return {
    summary: `${categoryLabel}出现值得入库的信号：${clip(item.title, 72)}。它涉及 ${entityText}，${keywordHint}这条信息会先进入雷达评分，再按新鲜度、趋势扩散和可信度决定是否推到首页。`,
    whatHappened: `${raw} ${sourceNote} 这不是只看标题的普通新闻条目，系统会把它与同一主体、同类标签和相近时间窗口里的来源合并，判断它是新事件、持续发酵，还是旧闻复现。`,
    whyItMatters: whyItMatters(item.category, tags, entityText, item.source),
    creatorImpact: creatorImpact(item.category, tags, entityText),
    contentAngle: contentAngle(item.category, tags, item.title),
    coverAngle: coverAngle(item.category, tags, item.title),
    worthFollowing: tags.some((tag) => ["发布会", "系统更新", "智驾", "平台规则", "争议"].includes(tag)) || (item.heatScore || 0) > 70,
  };
}

function whyItMatters(category: IndustryCategory, tags: string[], entityText: string, source: string): string {
  if (tags.includes("平台规则")) {
    return "平台流量、创作激励或推荐机制变化会直接影响选题节奏、标题策略和内容分发效率。它的价值不只在于“有没有热搜”，而在于是否会改变创作者接下来一两周的发布策略、内容结构和复盘指标。";
  }
  if (tags.includes("智驾")) {
    return "智能驾驶相关变化容易引发用户安全感、体验差异和车企技术路线讨论。对视频创作者来说，真正值得盯的是功能覆盖、接管体验、用户口碑和车企路线，而不是单纯复述一次 OTA 或发布节点。";
  }
  if (tags.includes("AI手机")) {
    return "AI 手机正在从营销概念转向真实功能竞争，关系到换机理由、发布会卖点和用户痛点表达。需要重点分辨它是品牌预热、真实功能落地，还是媒体二次搬运。";
  }
  if (tags.includes("发布会") || tags.includes("系统更新")) {
    return `${entityText} 的节点型动作会集中释放产品信息，适合做前瞻、解读、对比和购买建议。若后续出现官方口径、实测内容或多家独立来源互证，这条信息的可信度和视频价值会继续上升。`;
  }
  if (category === "auto") {
    return "汽车行业动作通常会持续发酵到价格、智驾、补能和用户口碑，具备多期内容延展空间。适合先入库观察，不急着按单条新闻下结论。";
  }
  if (category === "media") {
    return "创作者生态变化会影响内容生产、分发和变现，需要转化成可执行的方法论。尤其要区分平台真实规则变化、个体经验分享和情绪化讨论。";
  }
  return `该事件可能影响用户认知、品牌节奏或行业叙事，适合进入知识库等待后续交叉验证。当前来源是 ${source}，后续需要看是否有官方、垂媒或更多独立来源补强。`;
}

function creatorImpact(category: IndustryCategory, tags: string[], entityText: string): string {
  if (category === "media" || tags.includes("平台规则")) {
    return "可以转化为创作者避坑、平台规则解读、流量变化观察和内容策略调整。拍摄时不要只讲“规则变了”，更应该拆成影响对象、变化证据、应对动作和风险边界。";
  }
  if (category === "auto" || tags.includes("智驾")) {
    return "适合做体验对比、用户痛点拆解、车企路线变化和真实使用场景解释。优先找车主反馈、实测画面和同级竞品对照，避免只复述厂商话术。";
  }
  return `适合做新品解读、参数背后的用户价值、品牌路线对比和购买建议。若围绕 ${entityText} 做内容，可以把“发生了什么”转成“用户为什么要关心、值不值得等、和竞品有什么差别”。`;
}

function contentAngle(category: IndustryCategory, tags: string[], title: string): string {
  if (tags.includes("争议")) return `争议拆解：${clip(title, 42)}，普通用户到底该怎么看？`;
  if (tags.includes("平台规则")) return "平台规则变化会影响哪些创作者？用 3 个例子讲清楚。";
  if (tags.includes("AI手机")) return "AI 手机这次是不是噱头？从真实使用场景做判断。";
  if (tags.includes("智驾")) return "智驾更新看起来很强，但普通车主真正关心哪 3 件事？";
  if (category === "auto") return "把车企动作翻译成消费者能听懂的购车/用车影响。";
  return "用一条短视频讲清楚：这件事为什么值得普通用户关注。";
}

function coverAngle(category: IndustryCategory, tags: string[], title: string): string {
  if (tags.includes("发布会")) return "发布会定档 + 最大悬念 + 你该等吗";
  if (tags.includes("系统更新")) return "更新后最该试的 3 个功能";
  if (tags.includes("平台规则")) return "流量规则变了？创作者先看这 3 点";
  if (tags.includes("智驾")) return "智驾升级，不只看城市数量";
  return category === "auto" ? "车企新动作，谁最受影响" : `这条消息别只看标题：${clip(title, 24)}`;
}

function categoryName(category: IndustryCategory): string {
  return {
    digital: "数码行业",
    media: "自媒体/平台生态",
    auto: "汽车行业",
    mixed: "跨行业",
    unknown: "行业"
  }[category];
}

function clip(input: string, maxLength: number): string {
  return input.length <= maxLength ? input : `${input.slice(0, maxLength - 1)}…`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
