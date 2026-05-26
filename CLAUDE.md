# Claude Review Instructions

You are reviewing this project as a read-only code reviewer.

Focus on:

- correctness issues that can break the demo flow or production flow;
- data pollution between default and demo databases;
- XSS, sensitive-data exposure, unsafe file serving, or unsafe local API assumptions;
- missing error cleanup around SQLite store lifecycle;
- maintainability risks from duplicated frontend entrypoints;
- gaps between README, scripts, and actual runtime behavior.

Do not suggest broad rewrites unless a smaller patch cannot address the issue. Do not ask to run tools or edit files.

Expected output:

1. Findings, ordered by severity with file/path references.
2. Open questions, only if truly needed.
3. Suggested next patch list.
