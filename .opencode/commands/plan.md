---
description: Create a plan file from a Gitea ticket
---

You are in planning mode. Create a plan for ticket #$1.

1. **Fetch full ticket details**: Run `./scripts/gitea-helper.sh show $1` to get
   the full issue body (title, state, description). `tea issue show` only shows
   the summary — the body contains detailed requirements. Read the body in full
   before proceeding. Use the title for the plan title.

2. **Determine plan type**: single-phase (simple, contained change) or
   multi-phase (needs sub-tickets, multiple branches). Ask the user if the scope
   is unclear.

3. **Explore codebase**: Read the relevant source files to understand existing
   patterns, conventions, and architecture before writing the plan. Look at
   similar existing components for reference.

4. **Create plan file** at `.plans/$1-<short-title>.md` with this structure:

```markdown
# <plan-title>

**Ticket:** [#$1](gitea issue url)

**Package:** `<package-name>`

---

## Rationale

Brief description of the feature/chang and why it's needed. Reference any
relevant discussions or design docs. Add a short discussion of the approach and
trade-offs if there are multiple ways to implement.

---

## Phase X — <phase-title> (repeat for each phase)

**Sub-ticket**: [#<N>](gitea sub-ticket url)

**Branch**: `<user>/<N>-<short-name>` (use sub-ticket number, not parent)

### Design

Key design decisions, coordinate systems, data flow, limitations.

### Files

| Action | File | Content | |---|---| | Create | `src/<path>` | What this file
defines and why | | Modify | `src/<path>` | What changes and why |

**⚠️ STOP — DO NOT proceed to next phase until this PR is approved and merged.
⚠️**
```

For **single-phase**: one Phase section. No new sub-ticket. Branch uses parent
ticket number: `micurs/$1-<short-name>`. For **multi-phase**: repeat Phase
section for each phase. Create sub-tickets before writing the plan file (see
step 6).

5. **Present plan for review**: Output the full plan to the user. Ask specific
   questions about design decisions where there are trade-offs. Do not write the
   file until the user approves.

6. **If multi-phase, create sub-tickets**: Use `./scripts/gitea-helper.sh create`
   to create one sub-ticket per phase. Include the parent ticket reference,
   branch name, and phase description in each sub-ticket body. Map sub-ticket
   numbers to the plan.

7. **Write approved plan** to `.plans/$1-<short-title>.md`.

8. **Post approved plan** as comment to the main ticket using
   `./scripts/gitea-helper.sh comment`.

9. **Before any implementation**: Switch to the phase branch with
   `git checkout -b <branch-name>`. Never create files or modify code while on
   `main` or without the correct phase branch checked out.

**General guidelines:**

- Branch naming: `micurs/<ticket#>-<short-name>` per repo convention. For
  multi-phase, each phase's branch uses its **sub-ticket** number, not the
  parent ticket number.
- Each phase must be self-contained: files to create/modify, design rationale,
  known limitations.
- Include concrete file tables with explanations of what each file defines.
- Document known limitations and deferred work explicitly.
- Build and test at every phase to ensure correctness.
- Implement unit tests for all new functionality and edge cases.
- Between phases in multi-phase plans: include the emphatic STOP rule.
