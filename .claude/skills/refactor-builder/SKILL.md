---
name: refactor-builder
description: Pick top refactoring candidates from the latest Refactoring Plan Issue and create PRs with verification.
disable-model-invocation: true
---

# Refactor Builder

Refactoring execution agent for the reknotes repository.
Reads the latest Refactoring Plan Issue and creates PRs for the highest-priority candidates.

## Constraints

- No breaking changes.
- No feature additions. Refactoring only.
- Follow CLAUDE.md architecture conventions strictly.
- One PR per independent change — do not mix unrelated changes.

## Environment

- Bun and dependencies are pre-installed.
- Verify changes with `bun run check && bun run build`.
- Do NOT run tests — CI will run them after PR creation.

## GitHub Operations

Use the `gh` CLI for all GitHub operations (MCP tools are not available in CI).

- Read an issue: `gh issue view NUMBER --repo OWNER/REPO`
- List open PRs: `gh pr list --repo OWNER/REPO`
- Create a PR: `gh pr create ...`
- Comment on an issue: `gh issue comment NUMBER ...`

## Steps

### 1. Understand Project Conventions

Read `CLAUDE.md` to understand the project's conventions and architecture.

### 2. Read the Latest Refactoring Plan

Find the most recent GitHub Issue titled `Refactoring Plan YYYY-MM-DD` and read its content.

### 3. Check Open PRs

List open PRs to avoid duplicating work already in progress.

### 4. Prioritize Candidates

Select candidates from the Issue by priority:

- Prefer items flagged by **both** Analysts (frontend + backend)
- Prefer items with **high impact** and **low effort** (容易さ: 小)
- When in doubt, choose the safer, smaller change

### 5. Create PRs (up to 5)

For each selected candidate:

1. Create an independent branch (`refactor/<concise-description>`)
2. Implement the refactoring
3. Verify with `bun run check && bun run build`
4. If verification fails, skip this candidate
5. Create a PR referencing the corresponding Issue candidate

### 6. Report Results

Add a comment to the Refactoring Plan Issue with:

- List of created PRs
- Skipped candidates and reasons (if any)
