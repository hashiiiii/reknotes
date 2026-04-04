---
name: code-review
description: Execute automated PR review. Retrieve diff, launch reviewer agent, validate results against diff hunks, and post inline comments.
disable-model-invocation: true
argument-hint: "REPO: owner/repo, PR: #N"
---

# Code Review

Skill for automated PR review invoked from CI.
Launches a single reviewer agent, validates results, and posts inline comments.

## Steps

### 1. Parse Parameters

Parse the following:

```
$ARGUMENTS
```

Extract `owner`, `repo`, and `pullNumber` from the REPO and PR fields.

### 2. Retrieve PR Context

#### 2-1. Get PR diff

Call `mcp__github__get_pull_request_diff` with `owner`, `repo`, `pullNumber`.
Store the full diff output.

#### 2-2. Get PR description

Call `mcp__github__get_pull_request` with `owner`, `repo`, `pullNumber`.
Extract the PR body (description).

#### 2-3. Get changed files

Call `mcp__github__get_pull_request_files` with `owner`, `repo`, `pullNumber`.
Store the list of changed file paths.

### 3. Launch Reviewer Agent

Launch the **reviewer** agent using the Task tool with the following prompt:

```
PR description:
<PR body content>

Target files:
<list of changed file paths>

Diff for target files:
<full diff>
```

Set `max_turns` to 20.

### 4. Validate Results

Parse the reviewer agent's output as a JSON array `[{badge, file, line, body, suggestion?}]`.

#### Diff-line validation

Validate each comment against the diff:
- Parse the diff to determine which lines (on the RIGHT/new side) are within diff hunks for each file.
- **Remove** any comment whose `file:line` is NOT within a diff hunk.
- If a comment's line is slightly off (within 3 lines of a diff hunk boundary), adjust it to the nearest valid diff line.

### 5. Post Inline Comments

Use `mcp__github_inline_comment__create_inline_comment` to post each validated comment.
Do NOT use pending review APIs — they are not available.

#### Step 5-1: Post review comments

For each item in the validated results, call `mcp__github_inline_comment__create_inline_comment` with:
- `file`: item's `file`
- `line`: item's `line`
- `body`: the formatted comment body — MUST prepend the badge as bold text (e.g., `**[must]**`). If `suggestion` exists, append a GitHub suggestion block. The body MUST explain **why** the change is needed and **what improves** by applying it, not just state the problem.
  - Example:
    ````
    **[must]** `deleteNote` の戻り値 `false` を無視して 200 を返しています。

    削除対象のノートが存在しない場合でも成功レスポンスが返り、クライアントが削除成功と誤認します。404 を返すべきです。

    ```suggestion
    const deleted = await deleteNote(noteRepository, tagRepository, storageProvider, id);
    if (!deleted) return c.json({ error: "Not found" }, 404);
    ```
    ````
- `confirmed`: true

If a comment post fails (e.g., line not in diff), skip it and continue with the next one. Do NOT let a single failed comment abort the entire review.

**Stop here — do NOT proceed to any further steps. Do NOT call any other GitHub tool.**
