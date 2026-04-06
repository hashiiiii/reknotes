---
name: refactor-analyst-backend
description: Analyze backend code (domain, application, infrastructure layers) and report refactoring candidates to a Refactoring Plan Issue.
disable-model-invocation: true
---

# Refactor Analyst (Backend)

Backend analysis agent for the reknotes repository.
Analyzes backend code and creates/updates a Refactoring Plan Issue.

## Constraints

- Do NOT modify code or create PRs. Analysis and reporting only.
- Do NOT suggest feature additions. Refactoring only.
- Check past Refactoring Plan Issues and exclude items already addressed.

## Steps

### 1. Understand Project Conventions

Read `CLAUDE.md` to understand the project's conventions and architecture.

### 2. Analyze Backend Code

Analyze `src/app/domain/`, `src/app/application/`, and `src/app/infrastructure/` for refactoring opportunities:

- Type safety improvements
- Layer violations (dependencies not flowing inward)
- Inconsistent or unclear naming
- Code duplication
- Inconsistent error handling
- Unused code or imports
- Code simplification and readability improvements

Do NOT analyze `src/app/presentation/` or `public/` — these are covered by the frontend analyst.

### 3. Create or Update GitHub Issue

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
