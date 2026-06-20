<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Skills

They are located in the `.skills/` directory and designed to guide agents
through specific workflows. Each skill has a `SKILL.md` that defines its
purpose, when to use it.

- `planning`: For drafting implementation plans based on Gitea tickets. Requires
  a ticket reference and produces structured plans with rationale, steps,
  version changes, and tests.

- `code-review`: For reviewing PRs with a focus on code quality,
  maintainability, and alignment with project conventions. Provides actionable
  feedback and a summary of findings.

## Contribution Workflow

1. Open an issue describing the bugfix/feature before coding; track ongoing work
   through the issue.
2. For Plan Mode or pre-implementation planning, use the repo-local
   `.skills/planning` skill. Plans must reference a Gitea ticket and include the
   required ticket/branch, rationale, steps, version changes, and tests
   sections.
3. Branch off `main`, naming the branch after the issue with the
   `<username>/<ticket-number>-<short-title>` convention, and keep commits
   scoped/atomic.
4. Reference the issue ID in commit messages and PR descriptions.
5. Add/update tests for every behavior change.
6. Run `pnpm lint`, `pnpm build`, and `pnpm test` locally (the pre-push hook
   enforces this).
7. Use `tea` CLI or `./scripts/gitea-helper.sh` to create/update issues and PRs
   against the Gitea instance (`tea login` or `GITEA_TOKEN` env var required);
   prefer `origin-gitea` for publishing project branches. Use
   `./scripts/gitea-helper.sh pr comments <pr-number>` to read unresolved PR
   comments, `./scripts/gitea-helper.sh pr comment <file> <line> < comment.md`
   to add source-line feedback, and
   `./scripts/gitea-helper.sh pr reply <comment-id> < reply.md` to reply.
8. When opening a PR, link the issue(s) being addressed and wait for approval;
   merges happen after CI (Verify Pull Request workflow) passes.

## Architecture & Coding Guidelines

- Favor functional, immutable data structures.
- Avoid type casting and `any` types; prefer explicit types and interfaces.
- Use descriptive variable and function names that convey intent.
- Break down complex functions into smaller, reusable pieces.
- Keep documentation synchronized: update `readme.md` (and package-specific
  READMEs) alongside library changes when APIs shift.
- Always use curly braces for control flow bodies (`if`, `else`, `for`, `while`,
  `do`), even for single-line statements.
