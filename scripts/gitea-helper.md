# Gitea Helper Script

Script for managing Gitea issues and PRs via REST API.

## Security Setup

The script reads your Gitea token from:

1. `GITEA_TOKEN` environment variable (if set)
2. tea CLI config at `~/Library/Application Support/tea/config.yml` (fallback)

**Never commit tokens to the repository.**

Threaded PR review replies are not exposed by the Gitea 1.26 token API. The
`pr reply` command can use Gitea's browser form endpoint when
`GITEA_WEB_COOKIE` is set to a logged-in browser cookie. Treat this cookie like
a password and never commit it.

PR write commands infer the PR from the current git branch. Set `GITEA_PR_NUMBER`
to target a PR explicitly.

## Usage

```bash
# List issues
./scripts/gitea-helper.sh list           # Open issues
./scripts/gitea-helper.sh list all       # All issues
./scripts/gitea-helper.sh list closed    # Closed issues

# Show full ticket details (body, title, state)
./scripts/gitea-helper.sh show 54

# Create issue
./scripts/gitea-helper.sh create "Title" "Body text"

# Comment on issue
./scripts/gitea-helper.sh comment 24 "My comment"

# Close/reopen issue
./scripts/gitea-helper.sh close 24
./scripts/gitea-helper.sh reopen 24

# Create PR through the helper
./scripts/gitea-helper.sh pr create "PR Title" "PR Body" "head-branch" "base-branch"

# Read unresolved PR comments through the helper
./scripts/gitea-helper.sh pr comments 46

# Add a PR review comment to a source file line
./scripts/gitea-helper.sh pr comment src/file.ts 12 < comment.md

# Add a PR reply that references an existing comment
GITEA_WEB_COOKIE='lang=...; _csrf=...; i_like_gitea=...' \
./scripts/gitea-helper.sh pr reply 330 < reply.md

# PR commands can also be run directly
./scripts/gitea-pr.sh create "PR Title" "PR Body" "head-branch" "base-branch"
./scripts/gitea-pr.sh comments 46
./scripts/gitea-pr.sh comment src/file.ts 12 < comment.md
./scripts/gitea-pr.sh reply 330 < reply.md
```

## Setup

Ensure tea CLI is configured:

```bash
tea login
```

Or set environment variable:

```bash
export GITEA_TOKEN="your-token-here"
```
