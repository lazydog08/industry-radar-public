const FRONTPAGE_LIMIT = 5;
const FRONTPAGE_VIEW_STATE = {
  home: {
    shouldRenderFrontpage: true,
    emptyMessage: ""
  },
  search: {
    shouldRenderFrontpage: false,
    emptyMessage: "搜索结果视图不展示头版；清空关键词可回到首页头版。"
  },
  list: {
    shouldRenderFrontpage: false,
    emptyMessage: "当前列表视图不展示头版。"
  }
};

export function buildFrontpageModel(events = [], knowledgeHealth = null) {
  const eventList = Array.isArray(events) ? events.filter(Boolean) : [];
  const priorityEvents = [...eventList].sort(compareByPriority);
  const lead = selectLead(priorityEvents);

  return {
    lead,
    topSignals: priorityEvents.filter((event) => event !== lead).slice(0, FRONTPAGE_LIMIT),
    videoCandidates: eventList
      .filter((event) => videoPotential(event) >= 4)
      .sort(compareByPriority)
      .slice(0, FRONTPAGE_LIMIT),
    needsEvidence: selectNeedsEvidence(eventList, knowledgeHealth)
  };
}

function selectLead(events) {
  if (!events.length) return null;
  return events.find(isLeadCandidate) ?? events.find((event) => !hasNoHeadlineCap(event)) ?? events[0];
}

function isLeadCandidate(event) {
  return !hasNoHeadlineCap(event);
}

export function frontpageStateForView(viewMode) {
  return FRONTPAGE_VIEW_STATE[viewMode] || FRONTPAGE_VIEW_STATE.list;
}

function selectNeedsEvidence(events, knowledgeHealth) {
  const queued = knowledgeHealth?.queues?.needsEvidence;
  if (Array.isArray(queued)) return queued.filter(Boolean).slice(0, FRONTPAGE_LIMIT);

  return events
    .filter(needsEvidence)
    .sort(compareByPriority)
    .slice(0, FRONTPAGE_LIMIT);
}

function needsEvidence(event) {
  return event?.confidence === "low" || sourceCount(event) <= 1 || capsCount(event) > 0;
}

function compareByPriority(a, b) {
  return score(b) - score(a) || videoPotential(b) - videoPotential(a);
}

function score(event) {
  return numericScore(event?.radar_score) ?? numericScore(event?.importance_score) ?? 0;
}

function videoPotential(event) {
  return numericScore(event?.video_potential) ?? 0;
}

function sourceCount(event) {
  return Array.isArray(event?.sources) ? event.sources.filter(Boolean).length : 0;
}

function capsCount(event) {
  return Array.isArray(event?.caps) ? event.caps.filter(Boolean).length : 0;
}

function hasNoHeadlineCap(event) {
  return Array.isArray(event?.caps) && event.caps.some((cap) => String(cap).includes("不做头条"));
}

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const scoreValue = Number(value);
  return Number.isFinite(scoreValue) ? scoreValue : null;
}
