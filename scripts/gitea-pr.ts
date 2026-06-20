type GiteaUser = {
  login?: string;
};

type GiteaPull = {
  number?: number;
  title?: string;
  html_url?: string;
  message?: string;
  head?: {
    ref?: string;
    label?: string;
    sha?: string;
  };
};

type GiteaComment = {
  id?: number;
  body?: string;
  resolved?: boolean;
  resolver?: GiteaUser | null;
  html_url?: string;
  issue_url?: string;
  pull_request_url?: string;
  created_at?: string;
  user?: GiteaUser;
};

type GiteaReview = {
  id?: number;
  html_url?: string;
  pull_request_url?: string;
  message?: string;
};

type GiteaReviewComment = GiteaComment & {
  path?: string;
  position?: number;
  pull_request_review_id?: number;
};

class GiteaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const giteaUrl = Deno.env.get("GITEA_URL") ?? "http://gitea.micurs.com:3000";
const token = Deno.env.get("GITEA_TOKEN");
const repo = Deno.env.get("REPO") ?? "micurs/ts-geopro";
const branch = Deno.env.get("GITEA_BRANCH");
const prNumberOverride = Deno.env.get("GITEA_PR_NUMBER");
const webCookie = Deno.env.get("GITEA_WEB_COOKIE");
const command = Deno.args[0];

if (!token) {
  console.error(
    "Error: GITEA_TOKEN not found. Set GITEA_TOKEN env var or ensure tea CLI is configured.",
  );
  Deno.exit(1);
}

function usage(exitCode = 1): never {
  console.error("Usage: gitea-pr.sh {create|comments|comment|reply} [args...]");
  console.error("  create <title> <body> <head_branch> [base_branch]   Create pull request");
  console.error(
    "  comments <pr_number>                                List unresolved PR comments",
  );
  console.error(
    "  comment <source_file> <line_number>                  Add review comment from stdin",
  );
  console.error(
    "  reply <comment_id>                                   Add PR comment reply from stdin",
  );
  console.error("");
  console.error(
    "PR write commands infer the PR from the current git branch. Set GITEA_PR_NUMBER to override.",
  );
  Deno.exit(exitCode);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${giteaUrl}/api/v1/repos/${repo}/${path}`, {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String(body.message)
        : response.statusText;
    throw new GiteaApiError(response.status, `Gitea API error (${response.status}): ${message}`);
  }

  return body as T;
}

async function createPullRequest(args: string[]): Promise<void> {
  const [title, body, head, base = "main"] = args;
  if (!title || !body || !head) {
    console.error("Usage: gitea-pr.sh create <title> <body> <head_branch> [base_branch]");
    console.error('Example: gitea-pr.sh create "My PR" "Description" "micurs/my-branch" "main"');
    Deno.exit(1);
  }

  const pull = await request<GiteaPull>("pulls", {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });

  if (pull.message) {
    throw new Error(pull.message);
  }

  console.log(`✓ PR #${pull.number} created: ${pull.title}`);
  console.log(`  URL: ${pull.html_url}`);
}

async function readStdinBody(): Promise<string> {
  const body = (await new Response(Deno.stdin.readable).text()).trim();
  if (!body) {
    throw new Error("Comment body cannot be empty. Pipe a markdown file into stdin.");
  }
  return body;
}

async function findCurrentPullRequest(): Promise<GiteaPull> {
  if (prNumberOverride) {
    return await request<GiteaPull>(`pulls/${prNumberOverride}`);
  }

  if (!branch) {
    throw new Error(
      "Could not determine current branch. Set GITEA_PR_NUMBER or run from a git branch with an open PR.",
    );
  }

  const pulls = await request<GiteaPull[]>("pulls?state=open&limit=100");
  const pull = pulls.find(
    (candidate) => candidate.head?.ref === branch || candidate.head?.label?.endsWith(`:${branch}`),
  );

  if (!pull?.number) {
    throw new Error(
      `No open PR found for branch ${branch}. Set GITEA_PR_NUMBER to target a PR explicitly.`,
    );
  }

  return pull;
}

async function listComments(args: string[]): Promise<void> {
  const [prNumber] = args;
  if (!prNumber) {
    console.error("Usage: gitea-pr.sh comments <pr_number>");
    Deno.exit(1);
  }

  const comments = [
    ...(await request<GiteaComment[]>(`issues/${prNumber}/comments?limit=100`)),
    ...(await listReviewComments(prNumber)),
  ];
  const unresolved = comments.filter((comment) => {
    const body = comment.body?.trim();
    return Boolean(body) && comment.resolved !== true && !comment.resolver;
  });

  if (unresolved.length === 0) {
    console.log("No unresolved PR comments found.");
    return;
  }

  for (const comment of unresolved) {
    const user = comment.user?.login ?? "unknown";
    console.log(`#${comment.id} by ${user} at ${comment.created_at}`);
    if (isReviewComment(comment) && comment.path) {
      console.log(`${comment.path}:${comment.position ?? "?"}`);
    }
    console.log(comment.body?.trim());
    if (comment.html_url) {
      console.log(comment.html_url);
    }
    console.log();
  }
}

function isReviewComment(
  comment: GiteaComment | GiteaReviewComment,
): comment is GiteaReviewComment {
  return "path" in comment;
}

async function listReviewComments(prNumber: string): Promise<GiteaReviewComment[]> {
  const reviews = await request<GiteaReview[]>(`pulls/${prNumber}/reviews`);
  const comments: GiteaReviewComment[] = [];
  for (const review of reviews) {
    if (!review.id) {
      continue;
    }
    comments.push(
      ...(await request<GiteaReviewComment[]>(`pulls/${prNumber}/reviews/${review.id}/comments`)),
    );
  }
  return comments;
}

async function addReviewComment(args: string[]): Promise<void> {
  const [sourceFile, lineNumberText] = args;
  const lineNumber = Number(lineNumberText);
  if (!sourceFile || !Number.isInteger(lineNumber) || lineNumber < 1) {
    console.error("Usage: gitea-pr.sh comment <source_file> <line_number> < comment.md");
    Deno.exit(1);
  }

  const body = await readStdinBody();
  const pull = await findCurrentPullRequest();
  const review = await request<GiteaReview>(`pulls/${pull.number}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      body: "",
      commit_id: pull.head?.sha,
      event: "COMMENT",
      comments: [
        {
          body,
          path: sourceFile,
          new_position: lineNumber,
          old_position: 0,
        },
      ],
    }),
  });

  if (review.message) {
    throw new Error(review.message);
  }

  const createdComment = review.id
    ? await findReviewComment(String(pull.number), review.id, {
        body,
        path: sourceFile,
        position: lineNumber,
      })
    : undefined;

  console.log(
    `✓ Comment #${
      createdComment?.id ?? review.id
    } added to PR #${pull.number}: ${sourceFile}:${lineNumber}`,
  );
  if (createdComment?.html_url) {
    console.log(`  URL: ${createdComment.html_url}`);
  } else if (review.html_url) {
    console.log(`  URL: ${review.html_url}`);
  } else if (review.pull_request_url) {
    console.log(`  URL: ${review.pull_request_url}`);
  }
}

function extractPrNumber(comment: GiteaComment): string | undefined {
  const url = comment.issue_url || comment.pull_request_url || comment.html_url;
  return url?.match(/\/(?:issues|pulls)\/(\d+)/)?.[1];
}

async function findReviewCommentById(
  prNumber: string,
  commentId: string,
): Promise<GiteaReviewComment> {
  const comments = await listReviewComments(prNumber);
  const comment = comments.find((candidate) => String(candidate.id) === commentId);

  if (!comment) {
    throw new Error(`Review comment #${commentId} was not found on PR #${prNumber}.`);
  }
  if (!comment.path || !comment.position || !comment.pull_request_review_id) {
    throw new Error(`Review comment #${commentId} is missing path, line, or review metadata.`);
  }

  return comment;
}

async function findReviewComment(
  prNumber: string,
  reviewId: number,
  expected?: { body: string; path: string; position: number },
): Promise<GiteaReviewComment | undefined> {
  const comments = await request<GiteaReviewComment[]>(
    `pulls/${prNumber}/reviews/${reviewId}/comments`,
  );

  if (!expected) {
    return comments[0];
  }

  return (
    comments.find(
      (comment) =>
        comment.path === expected.path &&
        comment.position === expected.position &&
        comment.body?.trim() === expected.body,
    ) ?? comments[0]
  );
}

async function replyToCommentViaWebForm(
  pull: GiteaPull,
  commentId: string,
  body: string,
): Promise<void> {
  if (!webCookie) {
    throw new Error(
      "Gitea 1.26 does not expose review-comment replies through the token API. " +
        "Set GITEA_WEB_COOKIE to a logged-in browser cookie to use the web form endpoint.",
    );
  }

  const prNumber = String(pull.number);
  const comment = await findReviewCommentById(prNumber, commentId);
  const path = comment.path;
  const position = comment.position;
  const reviewId = comment.pull_request_review_id;
  if (!path || !position || !reviewId) {
    throw new Error(`Review comment #${commentId} is missing path, line, or review metadata.`);
  }

  const form = new FormData();
  form.set("origin", "timeline");
  form.set("latest_commit_id", pull.head?.sha ?? "");
  form.set("side", "proposed");
  form.set("line", String(position));
  form.set("path", path);
  form.set("diff_start_cid", "");
  form.set("diff_end_cid", "");
  form.set("diff_base_cid", "");
  form.set("content", body);
  form.set("reply", String(reviewId));
  form.set("single_review", "true");

  const response = await fetch(`${giteaUrl}/${repo}/pulls/${prNumber}/files/reviews/comments`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: webCookie,
      Referer: `${giteaUrl}/${repo}/pulls/${prNumber}`,
    },
    body: form,
  });

  if (response.status !== 303 && response.status !== 302) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gitea web form error (${response.status}): ${text.slice(0, 200)}`);
  }

  const location = response.headers.get("location") ?? "";
  if (location.includes("/user/login")) {
    throw new Error(
      "Gitea web form redirected to login. Refresh GITEA_WEB_COOKIE from a logged-in browser session.",
    );
  }

  console.log(`✓ Reply added to PR #${prNumber} for comment #${commentId} using web form endpoint`);
  console.log(`  URL: ${giteaUrl}/${repo}/pulls/${prNumber}#issuecomment-${commentId}`);
}

async function replyToComment(args: string[]): Promise<void> {
  const [commentId] = args;
  if (!commentId) {
    console.error("Usage: gitea-pr.sh reply <comment_id> < reply.md");
    Deno.exit(1);
  }

  const body = await readStdinBody();
  const pull = await findCurrentPullRequest();

  try {
    const reply = await request<GiteaReviewComment>(
      `pulls/${pull.number}/comments/${commentId}/replies`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );

    console.log(`✓ Reply added to PR #${pull.number} for comment #${commentId}`);
    if (reply.html_url) {
      console.log(`  URL: ${reply.html_url}`);
    }
  } catch (error) {
    if (error instanceof GiteaApiError && error.status === 405) {
      await replyToCommentViaWebForm(pull, commentId, body);
      return;
    }
    throw error;
  }
}

try {
  switch (command) {
    case "create":
      await createPullRequest(Deno.args.slice(1));
      break;
    case "comments":
      await listComments(Deno.args.slice(1));
      break;
    case "comment":
      await addReviewComment(Deno.args.slice(1));
      break;
    case "reply":
      await replyToComment(Deno.args.slice(1));
      break;
    default:
      usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
