export const DEFAULT_FILTER_SUMMARY = "分类、来源、标签、反馈";

const FILTER_KEYS = ["category", "source", "entity", "tag", "favorite", "follow", "ignored"];

export function summarizeActiveFilters(filters = {}) {
  const count = FILTER_KEYS.reduce((total, key) => (isActiveFilterValue(filters[key]) ? total + 1 : total), 0);
  return count > 0 ? `已启用 ${count} 个筛选` : DEFAULT_FILTER_SUMMARY;
}

function isActiveFilterValue(value) {
  if (Array.isArray(value)) return value.some(isActiveFilterValue);
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}
