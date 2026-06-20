type GiteaIssue = {
  number: number;
  state: string;
  title: string;
  body: string;
  html_url: string;
  labels?: { name: string }[];
};

type GiteaPull = {
  number?: number;
  title?: string;
  html_url?: string;
  message?: string;
  head?: { ref?: string; label?: string; sha?: string };
};

type GiteaComment = {
  id?: number;
  body?: string;
  resolved?: boolean;
  resolver?: { login?: string } | null;
  html_url?: string;
  issue_url?: string;
  pull_request_url?: string;
  created_at?: string;
  user?: { login?: string };
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
const token = Deno.env.get("GITEA_TOKEN") ?? getTokenFromTeaConfig();
const repo = Deno.env.get("REPO") ?? "micurs/type-gpu-mandelbrot";
const webCookie = Deno.env.get("GITEA_WEB_COOKIE");

function getTokenFromTeaConfig(): string | undefined {
  try {
    const configPath = `${Deno.env.get("HOME")}/Library/Application Support/tea/config.yml`;
    const text = Deno.readTextFileSync(configPath);
    const match = text.match(/token:\s*(\S+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

if (!token) {
  console.error(
    "Error: GITEA_TOKEN not found. Set GITEA_TOKEN env var or ensure tea CLI is configured.",
  );
  Deno.exit(1);
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

async function readStdinBody(): Promise<string> {
  const body = (await new Response(Deno.stdin.readable).text()).trim();
  if (!body) {
    throw new Error("Comment body cannot be empty. Pipe a markdown file into stdin.");
  }
  return body;
}

function isReviewComment(c: GiteaComment | GiteaReviewComment): c is GiteaReviewComment {
  return "path" in c;
}

function usage(exitCode = 1): never {
  console.error("Usage: gitea-helper <command> [args...]");
  console.error("");
  console.error("Issues commands:");
  console.error("  issues list [state]                    List issues (default: open)");
  console.error("  issues show <id>                        Show full ticket details");
  console.error('  issues create "<title>" "<body>"        Create new issue');
  console.error('  issues comment <id> "<message>"         Add comment to issue');
  console.error("  issues close <id>                       Close issue");
  console.error("  issues reopen <id>                      Reopen issue");
  console.error("");
  console.error("PR commands:");
  console.error('  pr create "<title>" "<body>" <head> [base]   Create pull request');
  console.error("  pr <id> comments                              List unresolved PR comments");
  console.error("  pr <id> comment <file> <line>                 Add review comment (stdin)");
  console.error("  pr <id> approve                                Approve PR");
  console.error("  pr <id> reply <comment-id>                    Reply to review comment (stdin)");
  console.error("");
  console.error("Set GITEA_URL, REPO, GITEA_TOKEN, GITEA_WEB_COOKIE env vars as needed.");
  Deno.exit(exitCode);
}

async function issuesList(state: string | undefined): Promise<void> {
  const query = state ? `?state=${state}` : "?state=open";
  const issues = await request<GiteaIssue[]>(`issues${query}&limit=20`);
  for (const issue of issues) {
    const labels = issue.labels?.map((l) => l.name).join(", ") || "";
    console.log(`#${issue.number}: [${issue.state}] ${issue.title}${labels ? ` (${labels})` : ""}`);
  }
}

async function issuesShow(id: string): Promise<void> {
  const issue = await request<GiteaIssue>(`issues/${id}`);
  console.log(`#${issue.number}: [${issue.state}] ${issue.title}`);
  console.log("");
  console.log(issue.body ?? "");
  console.log("");
  const labels = issue.labels?.map((l) => l.name).join(", ") || "";
  if (labels) console.log("Labels:", labels);
  console.log("URL:", issue.html_url);
}

async function issuesCreate(title: string, body: string): Promise<void> {
  const issue = await request<GiteaIssue>("issues", {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
  console.log(`✓ Issue #${issue.number} created: ${issue.title}`);
  console.log(`  URL: ${issue.html_url}`);
}

async function issuesComment(id: string, message: string): Promise<void> {
  const result = await request<{ html_url: string }>(`issues/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: message }),
  });
  console.log(`✓ Comment added: ${result.html_url}`);
}

async function issuesClose(id: string): Promise<void> {
  const issue = await request<GiteaIssue>(`issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
  console.log(`✓ Issue #${issue.number} closed: ${issue.title}`);
}

async function issuesReopen(id: string): Promise<void> {
  const issue = await request<GiteaIssue>(`issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "open" }),
  });
  console.log(`✓ Issue #${issue.number} reopened: ${issue.title}`);
}

async function prCreate(args: string[]): Promise<void> {
  const [title, body, head, base = "main"] = args;
  if (!title || !body || !head) {
    console.error('Usage: gitea-helper pr create "<title>" "<body>" <head> [base]');
    Deno.exit(1);
  }
  const pull = await request<GiteaPull>("pulls", {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });
  if (pull.message) throw new Error(pull.message);
  console.log(`✓ PR #${pull.number} created: ${pull.title}`);
  console.log(`  URL: ${pull.html_url}`);
}

async function listReviewComments(prNumber: string): Promise<GiteaReviewComment[]> {
  const reviews: GiteaReview[] = [];
  for (let page = 1; ; page++) {
    const batch = await request<GiteaReview[]>(`pulls/${prNumber}/reviews?page=${page}&limit=50`);
    if (batch.length === 0) break;
    reviews.push(...batch);
  }
  const results = await Promise.all(
    reviews
      .filter((r) => r.id)
      .map((r) => request<GiteaReviewComment[]>(`pulls/${prNumber}/reviews/${r.id}/comments`)),
  );
  return results.flat();
}

async function prComments(args: string[]): Promise<void> {
  const [prNumber] = args;
  if (!prNumber) {
    console.error("Usage: gitea-helper pr <id> comments");
    Deno.exit(1);
  }
  const comments: (GiteaComment | GiteaReviewComment)[] = [
    ...(await request<GiteaComment[]>(`issues/${prNumber}/comments?limit=100`)),
    ...(await listReviewComments(prNumber)),
  ];
  const unresolved = comments.filter((c) => {
    const body = c.body?.trim();
    return Boolean(body) && c.resolved !== true && !c.resolver;
  });
  if (unresolved.length === 0) {
    console.log("No unresolved PR comments found.");
    return;
  }
  for (const c of unresolved) {
    const user = c.user?.login ?? "unknown";
    console.log(`#${c.id} by ${user} at ${c.created_at}`);
    if (isReviewComment(c) && c.path) {
      console.log(`${c.path}:${c.position ?? "?"}`);
    }
    console.log(c.body?.trim());
    if (c.html_url) console.log(c.html_url);
    console.log();
  }
}

async function prComment(args: string[]): Promise<void> {
  const [prNumber, sourceFile, lineNumberText] = args;
  const lineNumber = Number(lineNumberText);
  if (!prNumber || !sourceFile || !Number.isInteger(lineNumber) || lineNumber < 1) {
    console.error("Usage: gitea-helper pr <id> comment <file> <line> < comment.md");
    Deno.exit(1);
  }
  const body = await readStdinBody();
  const pull = await request<GiteaPull>(`pulls/${prNumber}`);
  const review = await request<GiteaReview>(`pulls/${prNumber}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      body: "",
      commit_id: pull.head?.sha,
      event: "COMMENT",
      comments: [{ body, path: sourceFile, new_position: lineNumber, old_position: 0 }],
    }),
  });
  if (review.message) throw new Error(review.message);
  console.log(`✓ Comment added to PR #${prNumber}: ${sourceFile}:${lineNumber}`);
  if (review.html_url) console.log(`  URL: ${review.html_url}`);
}

async function prApprove(args: string[]): Promise<void> {
  const [prNumber] = args;
  if (!prNumber) {
    console.error("Usage: gitea-helper pr <id> approve");
    Deno.exit(1);
  }
  const pull = await request<GiteaPull>(`pulls/${prNumber}`);
  const review = await request<GiteaReview>(`pulls/${prNumber}/reviews`, {
    method: "POST",
    body: JSON.stringify({
      body: "Approved.",
      commit_id: pull.head?.sha,
      event: "APPROVED",
    }),
  });
  if (review.message) throw new Error(review.message);
  console.log(`✓ PR #${prNumber} approved`);
  if (review.html_url) console.log(`  URL: ${review.html_url}`);
}

async function findReviewCommentById(
  prNumber: string,
  commentId: string,
): Promise<GiteaReviewComment> {
  const comments = await listReviewComments(prNumber);
  const comment = comments.find((c) => String(c.id) === commentId);
  if (!comment) {
    throw new Error(`Review comment #${commentId} not found on PR #${prNumber}.`);
  }
  if (!comment.path || !comment.position || !comment.pull_request_review_id) {
    throw new Error(`Review comment #${commentId} is missing path, line, or review metadata.`);
  }
  return comment;
}

async function replyViaWebForm(prNumber: string, commentId: string, body: string): Promise<void> {
  if (!webCookie) {
    throw new Error(
      "Gitea 1.26 does not expose review-comment replies through the token API. " +
        "Set GITEA_WEB_COOKIE to a logged-in browser cookie to use the web form endpoint.",
    );
  }
  const pull = await request<GiteaPull>(`pulls/${prNumber}`);
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

async function prReply(args: string[]): Promise<void> {
  const [prNumber, commentId] = args;
  if (!prNumber || !commentId) {
    console.error("Usage: gitea-helper pr <id> reply <comment-id> < reply.md");
    Deno.exit(1);
  }
  const body = await readStdinBody();
  try {
    const reply = await request<GiteaReviewComment>(
      `pulls/${prNumber}/comments/${commentId}/replies`,
      { method: "POST", body: JSON.stringify({ body }) },
    );
    console.log(`✓ Reply added to PR #${prNumber} for comment #${commentId}`);
    if (reply.html_url) console.log(`  URL: ${reply.html_url}`);
  } catch (error) {
    if (error instanceof GiteaApiError && error.status === 405) {
      await replyViaWebForm(prNumber, commentId, body);
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const cleanArgs = Deno.args.filter((a) => a !== "--");
  const command = cleanArgs[0];
  const subOrFirst = cleanArgs[1];
  const rest = cleanArgs.slice(2);

  if (!command || !subOrFirst) {
    usage();
  }

  switch (command) {
    case "issues": {
      switch (subOrFirst) {
        case "list":
          await issuesList(rest[0]);
          break;
        case "show": {
          if (!rest[0]) {
            console.error("Usage: gitea-helper issues show <id>");
            Deno.exit(1);
          }
          await issuesShow(rest[0]);
          break;
        }
        case "create": {
          if (rest.length < 2) {
            console.error('Usage: gitea-helper issues create "<title>" "<body>"');
            Deno.exit(1);
          }
          await issuesCreate(rest[0], rest.slice(1).join(" "));
          break;
        }
        case "comment": {
          if (rest.length < 2) {
            console.error('Usage: gitea-helper issues comment <id> "<message>"');
            Deno.exit(1);
          }
          await issuesComment(rest[0], rest.slice(1).join(" "));
          break;
        }
        case "close": {
          if (!rest[0]) {
            console.error("Usage: gitea-helper issues close <id>");
            Deno.exit(1);
          }
          await issuesClose(rest[0]);
          break;
        }
        case "reopen": {
          if (!rest[0]) {
            console.error("Usage: gitea-helper issues reopen <id>");
            Deno.exit(1);
          }
          await issuesReopen(rest[0]);
          break;
        }
        default:
          usage();
      }
      break;
    }

    case "pr": {
      if (subOrFirst === "create") {
        await prCreate(rest);
        break;
      }

      const prSub = cleanArgs[2];
      const prRest = cleanArgs.slice(3);
      if (!prSub) usage();

      switch (prSub) {
        case "comments":
          await prComments([subOrFirst]);
          break;
        case "comment":
          await prComment([subOrFirst, ...prRest]);
          break;
        case "approve":
          await prApprove([subOrFirst]);
          break;
        case "reply":
          await prReply([subOrFirst, ...prRest]);
          break;
        default:
          usage();
      }
      break;
    }

    default:
      usage();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
