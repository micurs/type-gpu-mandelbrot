# Gitea Helper

Unified CLI for managing Gitea issues and PRs via REST API.

## Security Setup

The script reads your Gitea token from:

1. `GITEA_TOKEN` environment variable (if set)
2. tea CLI config at `~/Library/Application Support/tea/config.yml` (fallback)

**Never commit tokens to the repository.**

Threaded PR review replies are not exposed by the Gitea 1.26 token API. The
`pr <id> reply` command can use Gitea's browser form endpoint when
`GITEA_WEB_COOKIE` is set to a logged-in browser cookie. Treat this cookie like
a password and never commit it.

## Usage

```bash
# Via Vite+
vp run gitea-helper -- issues list
vp run gitea-helper -- issues show 1
vp run gitea-helper -- issues create "Title" "Body"
vp run gitea-helper -- issues comment 1 "My comment"
vp run gitea-helper -- issues close 1
vp run gitea-helper -- issues reopen 1

# Direct
deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts issues list
deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr create "Title" "Body" "head" "base"
deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr 1 comments
deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr 1 comment src/file.ts 12 < comment.md
deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr 1 approve
deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr 1 reply 330 < reply.md
```

## Issues Commands

| Command                            | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `issues list [state]`              | List issues (default: open). State: open, closed, all |
| `issues show <id>`                 | Show full ticket details                              |
| `issues create "<title>" "<body>"` | Create new issue                                      |
| `issues comment <id> "<message>"`  | Add comment                                           |
| `issues close <id>`                | Close issue                                           |
| `issues reopen <id>`               | Reopen issue                                          |

## PR Commands

| Command                                      | Description                               |
| -------------------------------------------- | ----------------------------------------- |
| `pr create "<title>" "<body>" <head> [base]` | Create pull request                       |
| `pr <id> comments`                           | List unresolved PR comments               |
| `pr <id> comment <file> <line>`              | Add review comment (body from stdin)      |
| `pr <id> approve`                            | Approve PR                                |
| `pr <id> reply <comment-id>`                 | Reply to review comment (body from stdin) |

## Setup

```bash
tea login
```

Or set environment variable:

```bash
export GITEA_TOKEN="your-token-here"
```
