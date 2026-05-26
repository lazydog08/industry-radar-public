# Agent Notes

- This project is a local-first industry intelligence radar and personal knowledge base.
- Do not commit, log, or transmit `.env`, tokens, cookies, passwords, production data, private reports, or local SQLite contents.
- Prefer the isolated demo flow for review and validation: `DATABASE_URL=./data/runtime/demo.sqlite REPORT_OUTPUT_DIR=./data/runtime/reports`.
- Generated data under `data/runtime`, `data/reports`, `data/simulations`, `data/real-runs`, `dist`, `logs`, `backups`, and `node_modules` should not be included in review diffs.
- Claude is read-only for review. Codex implements any fixes.
