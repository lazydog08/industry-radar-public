import assert from "node:assert/strict";
import test from "node:test";
import { buildFrontpageModel, frontpageStateForView } from "../src/web/editorial-frontpage.js";

const baseEvent = {
  id: "event-base",
  title: "基础事件",
  summary: "摘要",
  why_it_matters: "重要性",
  content_angle: "视频角度",
  radar_score: 40,
  radar_level: "C",
  radar_section: "background",
  video_potential: 2,
  confidence: "medium",
  sources: [{ source: "ithome", url: "https://www.ithome.com/a.htm" }],
  tags: [],
  entities: []
};

test("selects a high-score lead story before lower-score items", () => {
  const model = buildFrontpageModel([
    { ...baseEvent, id: "low", title: "低优先", radar_score: 45 },
    { ...baseEvent, id: "lead", title: "头条", radar_score: 91, radar_section: "must_read" }
  ], null);
  assert.equal(model.lead.id, "lead");
  assert.deepEqual(model.topSignals.map((event) => event.id), ["low"]);
});

test("keeps review and experience stories out of the lead slot", () => {
  const model = buildFrontpageModel([
    {
      ...baseEvent,
      id: "review",
      title: "评测稿",
      radar_score: 69,
      radar_section: "video_ready",
      caps: ["评测/体验稿默认不做头条"]
    },
    {
      ...baseEvent,
      id: "policy",
      title: "政策变化",
      radar_score: 62,
      radar_section: "developing",
      caps: []
    }
  ], null);

  assert.equal(model.lead.id, "policy");
  assert.deepEqual(model.topSignals.map((event) => event.id), ["review"]);
});

test("extracts video candidates and evidence queue separately", () => {
  const model = buildFrontpageModel([
    { ...baseEvent, id: "video", title: "可拍", radar_score: 70, video_potential: 5, confidence: "high" },
    { ...baseEvent, id: "evidence", title: "需补证", confidence: "low", sources: [] }
  ], {
    queues: {
      needsEvidence: [{ ...baseEvent, id: "evidence", title: "需补证", confidence: "low", sources: [] }],
      videoCandidates: []
    }
  });
  assert.equal(model.videoCandidates[0].id, "video");
  assert.equal(model.needsEvidence[0].id, "evidence");
});

test("falls back to importance score and derives empty-state queues safely", () => {
  const model = buildFrontpageModel([
    {
      ...baseEvent,
      id: "fallback",
      radar_score: undefined,
      importance_score: 82,
      video_potential: 4,
      confidence: "high",
      sources: [
        { source: "official", url: "https://example.com/a" },
        { source: "ithome", url: "https://example.com/b" }
      ]
    },
    {
      ...baseEvent,
      id: "capped",
      radar_score: 51,
      confidence: "high",
      caps: ["单一弱来源封顶"],
      sources: [
        { source: "official", url: "https://example.com/c" },
        { source: "ithome", url: "https://example.com/d" }
      ]
    }
  ], { queues: {} });

  assert.equal(model.lead.id, "fallback");
  assert.equal(model.videoCandidates[0].id, "fallback");
  assert.deepEqual(model.needsEvidence.map((event) => event.id), ["capped"]);

  assert.deepEqual(buildFrontpageModel(null, null), {
    lead: null,
    topSignals: [],
    videoCandidates: [],
    needsEvidence: []
  });
});

test("keeps the frontpage hidden when overview refreshes outside the home view", () => {
  assert.deepEqual(frontpageStateForView("home"), {
    shouldRenderFrontpage: true,
    emptyMessage: ""
  });
  assert.deepEqual(frontpageStateForView("search"), {
    shouldRenderFrontpage: false,
    emptyMessage: "搜索结果视图不展示头版；清空关键词可回到首页头版。"
  });
  assert.deepEqual(frontpageStateForView("list"), {
    shouldRenderFrontpage: false,
    emptyMessage: "当前列表视图不展示头版。"
  });
});
