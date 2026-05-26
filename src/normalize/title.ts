const prefixNoise = [
  "突发",
  "重磅",
  "快讯",
  "独家",
  "网传",
  "爆料",
  "官方",
  "消息称",
  "报道称"
];

export function normalizeTitle(title: string): string {
  let value = title.toLowerCase();
  value = value.replace(/【[^】]{1,20}】/g, "");
  value = value.replace(/\[[^\]]{1,20}\]/g, "");
  value = value.replace(/（[^）]{1,20}）/g, "");
  value = value.replace(/\([^)]{1,20}\)/g, "");
  for (const noise of prefixNoise) {
    value = value.replace(new RegExp(`^${noise}`), "");
  }
  return value
    .replace(/[-_｜|:：,，.。!！?？;；"'“”‘’《》<>/\\\s]/g, "")
    .replace(/(全文|详情|视频|图文|一图看懂|速览)$/g, "")
    .trim();
}

function bigrams(input: string): Set<string> {
  const normalized = normalizeTitle(input);
  if (normalized.length <= 2) return new Set([normalized]);
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

export function titleSimilarity(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const gram of left) {
    if (right.has(gram)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function canonicalTitle(title: string): string {
  return normalizeTitle(title).slice(0, 160);
}
