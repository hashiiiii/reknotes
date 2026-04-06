---
name: refactor-analyst-frontend
description: Analyze frontend code (CSS, JS, routes, views) and report refactoring candidates to a Refactoring Plan Issue.
disable-model-invocation: true
---

# Refactor Analyst (Frontend)

Frontend analysis agent for the reknotes repository.
Analyzes frontend code and creates/updates a Refactoring Plan Issue.

## Constraints

- Do NOT modify code or create PRs. Analysis and reporting only.
- Do NOT suggest feature additions. Refactoring only.
- Check past Refactoring Plan Issues and exclude items already addressed.

## Steps

### 1. Understand Project Conventions

Read `CLAUDE.md` to understand the project's conventions and architecture.

### 2. Analyze Frontend Code

Analyze the following areas for refactoring opportunities:

- `public/css/` — CSS cleanup, deduplication, naming improvements
- `public/js/` — JavaScript improvements, module structure
- `src/app/presentation/` — Route handlers, views, templates

Do NOT analyze `src/app/domain/`, `src/app/application/`, or `src/app/infrastructure/` — these are covered by the backend analyst.

### 3. Create or Update GitHub Issue

Use the `gh` CLI for all GitHub operations (MCP tools are not available in CI).

- Search for an existing issue: `gh search issues "Refactoring Plan YYYY-MM-DD" --repo OWNER/REPO --state open`
- Create a new issue: `gh issue create ...`
- Append as a comment: `gh issue comment NUMBER ...`

Create or append to a GitHub Issue:

- **Title**: `Refactoring Plan YYYY-MM-DD` (today's date)
- If an Issue with the same date already exists, append as a comment
- For each candidate, include:
  - **何を**: Specific improvement
  - **なぜ**: Why it should be improved
  - **どこ**: Target file path(s)
  - **容易さ**: 小 / 中 / 大
  - **インパクト**: 低 / 中 / 高
- Maximum 10 candidates. Each must be specific and actionable.
