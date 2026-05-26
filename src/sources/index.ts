import type { SourceAdapter } from "../types.js";
import { bilibiliSource } from "./bilibili.js";
import { ithomeSource } from "./ithome.js";
import { officialSource } from "./official.js";
import { zhihuSource } from "./zhihu.js";
import { weiboSource } from "./weibo.js";
import { mockSource } from "./mock.js";

export function getSourceAdapters(useMock: boolean): SourceAdapter[] {
  if (useMock) return [mockSource];
  return [ithomeSource, bilibiliSource, officialSource, zhihuSource, weiboSource];
}

export { mockSource };
