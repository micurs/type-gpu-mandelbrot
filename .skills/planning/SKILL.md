---
name: planning
description: Create implementation plans for this ts-geopro project from required Gitea tickets. Use when asked to plan, draft a plan, create an implementation plan, scope ticket work, or outline work before coding; always require a Gitea issue from http://gitea.micurs.com:3000/micurs/ts-geopro/issues and produce the project plan sections for ticket/branch, rationale, steps, version changes, and tests.
---

# Planning

## Workflow

Require a Gitea ticket before producing a plan. Accept a full issue URL or an issue number that can be resolved against:

`http://gitea.micurs.com:3000/micurs/ts-geopro/issues`

If the request does not identify a ticket, ask for the ticket and stop. Do not create a ticket-free plan.

Use `./scripts/gitea-helper.sh` to interact with Gitea. Instructions are in `./scripts/gitea-helper.md`. To read PR feedback, run `./scripts/gitea-helper.sh pr comments <pr-number>`. To add PR feedback, use `./scripts/gitea-helper.sh pr comment <source-file> <line-number> < comment.md` or `./scripts/gitea-helper.sh pr reply <comment-id> < reply.md`.

Before drafting the plan:

1. Read the ticket details when available.
2. Inspect the repo enough to understand the affected packages, existing patterns, and likely test locations.
3. Recommend a git branch name using `<username>/<ticket-number>-<short-title>`. Use the ticket number without a `#` prefix, and format the short title as lowercase kebab-case.
4. Treat `origin-gitea` as the preferred git remote for this project when planning branch publication or follow-up execution.
5. Apply SemVer 2.0 when recommending version changes:
   - `MAJOR` for incompatible public API or behavior changes.
   - `MINOR` for backward-compatible functionality.
   - `PATCH` for backward-compatible fixes, docs, tests, or internal implementation changes.
   - `none` when no package version should change, and explain why.
6. First step should always be to create the branch and link it to the ticket.

## Output Format

Produce the plan with exactly these top-level sections and in this order:

```markdown
## 1. Ticket and Git Branch Name

- Ticket: <issue number and URL>
- Branch: <username>/<ticket-number>-<short-title>
- Remote: origin-gitea

## 2. Rationale

<Explain the overall approach for solving the ticket. Mention the main affected areas and why this approach fits the existing project.>

## 3. Steps

1. <Detailed implementation step>
2. <Detailed implementation step>
3. <Detailed implementation step>

## 4. Version Changes

<Recommend MAJOR, MINOR, PATCH, or none. Explain the SemVer 2.0 reasoning and name the affected package(s) when known.>

## 5. Tests

<List the tests implemented if work is already complete. If this is a pre-implementation plan, list the tests to implement and label them as planned.>
```

Keep the plan concrete enough to execute, but avoid over-specifying code that should be discovered during implementation. If the ticket is ambiguous, include the assumption in the relevant section and ask only for information that materially affects the plan.

Once the plan is approved by the user post it - in full - as a comment on the Gitea issue.
Use `./scripts/gitea-helper.sh comment <issue-number> "$(cat plan.md)"` to post the plan.
Do not post the plan until it is approved by the user.
