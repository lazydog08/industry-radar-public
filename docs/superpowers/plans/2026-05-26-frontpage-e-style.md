# Frontpage E Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Web UI into the selected "E. 报纸头版 / 情报日报" editorial front page while preserving local and static data workflows.

**Architecture:** Keep the current no-framework browser app. Add small pure helpers for editorial selection and layout summaries where testable, then update `src/web/index.html`, `src/web/app.js`, and `src/web/styles.css` to render an editorial masthead, lead story, briefing rail, and subordinate workbench.

**Tech Stack:** Node.js 25, TypeScript backend, Express, vanilla ESM browser JavaScript, CSS, Node built-in test runner.

---

### Task 1: Editorial Selection Helpers

**Files:**
- Create: `src/web/editorial-frontpage.js`
- Create: `tests/editorial-frontpage.test.mjs`
- Modify: `package.json`

- [x] **Step 1: Write failing tests**

Add tests for these behaviors:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildFrontpageModel } from "../src/web/editorial-frontpage.js";

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
  assert.equal(model.topSignals[0].id, "lead");
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
```

- [x] **Step 2: Run red test**

Run: `pnpm test:web`

Expected: FAIL because `src/web/editorial-frontpage.js` does not exist.

- [x] **Step 3: Implement helper**

Create `buildFrontpageModel(events, knowledgeHealth)` that returns:

```js
{
  lead,
  topSignals,
  videoCandidates,
  needsEvidence
}
```

Sorting rule: score descending, then video potential descending. Limits: top signals 5, video candidates 5, evidence queue 5.

- [x] **Step 4: Run green test**

Run: `pnpm test:web`

Expected: PASS.

### Task 2: Editorial HTML Structure And Rendering

**Files:**
- Modify: `src/web/index.html`
- Modify: `src/web/app.js`
- Modify: `src/web/editorial-frontpage.js` if integration exposes missing helper needs.

- [x] **Step 1: Add frontpage containers**

Add semantic containers:

```html
<section class="frontpage" aria-label="今日情报头版">
  <article id="frontpageLead" class="frontpage-lead"></article>
  <aside class="frontpage-brief">
    <div id="frontpageStats" class="frontpage-stats"></div>
    <div class="frontpage-search"></div>
  </aside>
</section>
<section id="editorialStrips" class="editorial-strips" aria-label="编辑精选"></section>
```

Move the search controls into the frontpage brief visually while preserving existing element ids.

- [x] **Step 2: Render model**

Import `buildFrontpageModel` into `src/web/app.js`. In `renderOverview` or `renderHome`, compute the frontpage model from `events` and `knowledgeHealth`, then render:

- lead story;
- top signals;
- video candidates;
- needs evidence.

Each rendered event must keep `data-event-id` selection.

- [x] **Step 3: Preserve workflows**

Ensure `search()`, `selectEvent()`, report rendering, timeline rendering, and feedback still operate with the same ids and existing state.

### Task 3: Newspaper Front Page Styling

**Files:**
- Modify: `src/web/styles.css`
- Modify: `docs/MOBILE_UI_REVIEW.md`

- [x] **Step 1: Replace dashboard visual hierarchy**

Apply an editorial visual system:

- paper background `#f5efe4`;
- ink text `#1e1a16`;
- surface `#fffaf1`;
- red accent `#b42318`;
- blue link accent `#1d4ed8`;
- serif display type for masthead and lead headline;
- 8px or smaller border radius for repeated cards.

- [x] **Step 2: Desktop layout**

Use CSS grid:

- masthead full width;
- frontpage lead `minmax(0, 1.2fr)`;
- brief rail `minmax(300px, .8fr)`;
- workbench below with event feed and side rail.

- [x] **Step 3: Mobile layout**

At 760px and below:

- one-column flow;
- no horizontal overflow;
- metric counters two columns;
- lead headline scales down;
- filters and buttons have stable 44px tap targets.

### Task 4: Verification, Docs, And Review

**Files:**
- Modify: `progress.md`
- Modify: `decision_log.md`
- Modify: `.reviews/latest.md` through `scripts/review.sh` only if Claude review runs successfully.

- [x] **Step 1: Run local verification**

Run:

```bash
pnpm test
node --check src/web/app.js
node --check src/web/filter-summary.js
node --check src/web/editorial-frontpage.js
pnpm typecheck
pnpm build
git diff --check
```

- [x] **Step 2: Browser verification**

Run a local service with isolated data:

```bash
PORT=3895 HOST=127.0.0.1 DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports PUBLIC_DATA_DIR=./data/runtime/filter-summary-public pnpm serve
```

Verify desktop and 390px mobile:

- frontpage loads;
- lead story visible;
- source links visible;
- search works;
- event detail changes;
- static JSON still loads;
- no console errors;
- no horizontal overflow.

- [x] **Step 3: Claude review**

Run:

```bash
scripts/review.sh
```

If Claude review times out, record the timeout and proceed only after local verification still passes.

- [x] **Step 4: Update project logs**

Update `progress.md` and `decision_log.md` with the implemented E-style redesign, verification commands, and any review findings.
