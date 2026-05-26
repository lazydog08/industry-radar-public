# Frontpage E Style Design

## Goal

Redesign the Web UI into an editorial intelligence front page inspired by the selected "E. 报纸头版 / 情报日报" direction. The page should feel like a daily industry intelligence newspaper with strong editorial hierarchy, not an admin dashboard.

## Product Intent

The UI is for daily review and creator topic selection. On first open, the user should understand:

- what the most important story is today,
- why it matters,
- which items are worth filming,
- which items need more evidence,
- where to continue reading source links and archived reports.

## Visual Direction

Use a newspaper front-page metaphor with modern product polish:

- warm paper background, off-white surfaces, black ink text, restrained red/amber/blue accents;
- masthead-style top area with date/update state and concise metrics;
- one dominant lead story using the top-ranked event;
- secondary columns for "Top Signals", "Video Candidates", and "Needs Evidence";
- compact but readable lists below the lead story;
- avoid dark dashboards, gradient blobs, oversized SaaS hero styling, and nested cards.

## Layout

Desktop layout:

1. Masthead
   - Product name: `RADAR DAILY` / `行业情报雷达`.
   - Update time and data mode.
   - Four small counters for events, must-read, video candidates, reports.

2. Front Page
   - Left lead story: title, score label, summary, "why it matters", source chips.
   - Right briefing rail: today's section counts, confidence/source status, search entry.

3. Editorial Strips
   - Top signals grouped by radar section.
   - Video-ready candidates with explicit content angle.
   - Needs-evidence queue from knowledge health.

4. Workbench
   - Event list and knowledge detail remain available, but visually subordinate to the front page.
   - Report archive and timeline stay in the right-side reading rail on wide screens.

Mobile layout:

- Masthead remains compact.
- Lead story comes first.
- Search comes before long lists.
- All columns stack into a single reading flow.
- No horizontal overflow at 390px.

## Interaction Rules

- Search and advanced filters continue to work.
- Event selection continues to update the knowledge card.
- Static read-only mode keeps feedback buttons disabled with a visible reason.
- Source links remain visible and clickable.
- Reports remain clickable.
- Timeline continues to work.
- The existing `public-data` static mode remains compatible.

## Implementation Boundaries

- Keep the local-first security model.
- Do not add external UI frameworks.
- Do not transmit data, keys, cookies, reports, or SQLite contents.
- Do not commit generated `data/runtime`, `public-data`, logs, reports, or `.reviews`.
- Preserve existing API contracts.

## Acceptance Criteria

- First viewport reads as an editorial intelligence front page, not a backend panel.
- The top story, score, summary, sources, and next actions are visible without hunting.
- All previous core workflows still work: overview load, search, detail, feedback, reports, timeline, static mode.
- Mobile 390px has no incoherent overlap or horizontal overflow.
- Verification includes automated checks, browser inspection, and Claude review.
