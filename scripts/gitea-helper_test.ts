import { assertEquals, assertStringIncludes, assert } from "jsr:@std/assert";

const scriptPath = new URL("gitea-helper.ts", import.meta.url).pathname;

async function runGiteaHelper(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-env", "--allow-net", "--allow-read", scriptPath, ...args],
    env: { GITEA_TOKEN: "test-token", ...env },
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout, stderr, code } = await cmd.output();
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    code,
  };
}

Deno.test("gitea-helper --help shows usage", async () => {
  const { stderr, code } = await runGiteaHelper(["--help"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "issues");
  assertStringIncludes(stderr, "pr");
});

Deno.test("gitea-helper with no args shows usage", async () => {
  const { stderr, code } = await runGiteaHelper([]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
});

Deno.test("gitea-helper issues with no subcommand shows usage", async () => {
  const { stderr, code } = await runGiteaHelper(["issues"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
});

Deno.test("gitea-helper pr with no subcommand shows usage", async () => {
  const { stderr, code } = await runGiteaHelper(["pr"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
});

Deno.test("issues show with no id shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "show"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "show");
});

Deno.test("issues create with no args shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "create"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "create");
});

Deno.test("issues create with one arg shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "create", "Title"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "create");
});

Deno.test("issues comment with no id shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "comment"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "comment");
});

Deno.test("issues comment with no message shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "comment", "1"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "comment");
});

Deno.test("issues close with no id shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "close"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "close");
});

Deno.test("issues reopen with no id shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["issues", "reopen"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "reopen");
});

Deno.test("pr create with no args shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["pr", "create"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "create");
});

Deno.test("pr comments with no id shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["pr", "comments"]);
  // This hits the "no PR ID" check
  assertStringIncludes(stderr, "Usage:");
});

Deno.test("pr reply with no id shows error", async () => {
  const { stderr, code } = await runGiteaHelper(["pr", "1", "reply"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "Usage:");
  assertStringIncludes(stderr, "reply");
});

Deno.test("issues show calls API with provided ID", async () => {
  const server = Deno.serve({ port: 0 }, (req: Request) => {
    if (req.url.includes("/issues/42")) {
      return new Response(
        JSON.stringify({ number: 42, state: "open", title: "Test", body: "Body", html_url: "" }),
      );
    }
    return new Response("Not found", { status: 404 });
  });
  const { port } = server.addr as Deno.NetAddr;

  const { stdout } = await runGiteaHelper(["issues", "show", "42"], {
    GITEA_URL: `http://127.0.0.1:${port}`,
  });

  server.shutdown();
  assertStringIncludes(stdout, "#42:");
  assertStringIncludes(stdout, "[open]");
});

Deno.test("pr comment uses explicit PR ID not branch", async () => {
  let requestedPrId = "";
  let reviewPostBody = "";
  const server = Deno.serve({ port: 0 }, async (req: Request) => {
    const url = req.url;
    // Must check /reviews before /pulls to avoid catching GET /pulls/99
    if (url.includes("/pulls/99/reviews")) {
      if (req.method === "POST") {
        reviewPostBody = await req.text();
        return new Response(JSON.stringify({ id: 1, html_url: "http://example.com" }));
      }
      return new Response(JSON.stringify([]));
    }
    if (url.includes("/pulls/99")) {
      return new Response(JSON.stringify({ number: 99, head: { sha: "abc123" } }));
    }
    const pullsMatch = url.match(/\/pulls\/(\d+)/);
    if (pullsMatch) requestedPrId = pullsMatch[1];
    return new Response(JSON.stringify({}), { status: 404 });
  });
  const { port } = server.addr as Deno.NetAddr;

  const proc = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-env",
      "--allow-net",
      "--allow-read",
      scriptPath,
      "pr",
      "99",
      "comment",
      "src/file.ts",
      "12",
    ],
    env: { GITEA_TOKEN: "test-token", GITEA_URL: `http://127.0.0.1:${port}` },
    stdout: "piped",
    stderr: "piped",
    stdin: "piped",
  });

  const child = proc.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode("Test comment\n"));
  await writer.close();

  const { stdout, stderr } = await child.output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);

  server.shutdown();

  // Should NOT have tried to find PR by branch
  assertEquals(err, "");
  assertStringIncludes(out, "PR #99");
  // Verify the review POST was made with correct payload
  assertStringIncludes(reviewPostBody, "COMMENT");
  assertStringIncludes(reviewPostBody, "src/file.ts");
  assertStringIncludes(reviewPostBody, "Test comment");
});

Deno.test("pr approve targets explicit PR ID", async () => {
  let targetedPr = "";
  const server = Deno.serve({ port: 0 }, async (req: Request) => {
    const url = req.url;
    if (url.includes("/pulls/77") && req.method === "GET") {
      targetedPr = "77";
      return new Response(JSON.stringify({ number: 77, head: { sha: "def456" } }));
    }
    if (url.includes("/pulls/77/reviews") && req.method === "POST") {
      const body = await req.json();
      assertEquals(body.event, "APPROVED");
      return new Response(JSON.stringify({ id: 5, html_url: "http://example.com/77" }));
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
  const { port } = server.addr as Deno.NetAddr;

  const { stdout, code } = await runGiteaHelper(["pr", "77", "approve"], {
    GITEA_URL: `http://127.0.0.1:${port}`,
  });

  server.shutdown();
  assertEquals(code, 0);
  assertEquals(targetedPr, "77");
  assertStringIncludes(stdout, "PR #77 approved");
});

Deno.test("issues create sends correct title and body", async () => {
  let receivedBody = "";
  const server = Deno.serve({ port: 0 }, async (req: Request) => {
    if (req.url.includes("/issues") && req.method === "POST") {
      receivedBody = await req.text();
      return new Response(
        JSON.stringify({ number: 100, title: "Test Issue", html_url: "http://example.com/100" }),
      );
    }
    return new Response("Not found", { status: 404 });
  });
  const { port } = server.addr as Deno.NetAddr;

  const { stdout } = await runGiteaHelper(["issues", "create", "Test Issue", "This is the body"], {
    GITEA_URL: `http://127.0.0.1:${port}`,
  });

  server.shutdown();
  assertStringIncludes(stdout, "Issue #100 created");
  assertStringIncludes(receivedBody, "Test Issue");
  assertStringIncludes(receivedBody, "This is the body");
});

Deno.test("ignores -- separator in args (for vp run compat)", async () => {
  // Simulates `vp run gitea-helper -- issues list` where -- is passed as arg
  const proc = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-env", "--allow-net", "--allow-read", scriptPath, "--", "issues", "list"],
    env: { GITEA_TOKEN: "test-token" },
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await proc.output();
  const err = new TextDecoder().decode(stderr);
  // Should not show usage; should attempt API call instead
  assertStringIncludes(err, "Gitea API error");
  assertEquals(code, 1);
});

Deno.test("paginatedRequest collects all pages", async () => {
  let calls: string[] = [];
  const server = Deno.serve({ port: 0 }, (req: Request) => {
    const url = new URL(req.url);
    const path = url.pathname;
    const page = url.searchParams.get("page") ?? "1";
    calls.push(`${path}?page=${page}`);

    // issues/99/comments - return empty (no issue comments)
    if (path.includes("/issues/99/comments")) {
      return new Response(JSON.stringify([]));
    }

    // pulls/99/reviews - return 2 pages
    if (path.includes("/pulls/99/reviews") && !path.includes("/comments")) {
      if (page === "1") return new Response(JSON.stringify([{ id: 1 }]));
      if (page === "2") return new Response(JSON.stringify([{ id: 2 }]));
      return new Response(JSON.stringify([]));
    }

    // pulls/99/reviews/1/comments - return 2 pages
    if (path.includes("/reviews/1/comments")) {
      if (page === "1")
        return new Response(
          JSON.stringify([
            { id: 10, body: "First", path: "a.ts", position: 1, pull_request_review_id: 1 },
          ]),
        );
      if (page === "2")
        return new Response(
          JSON.stringify([
            { id: 11, body: "Second", path: "b.ts", position: 2, pull_request_review_id: 1 },
          ]),
        );
      return new Response(JSON.stringify([]));
    }

    // pulls/99/reviews/2/comments - return 1 page then empty
    if (path.includes("/reviews/2/comments")) {
      if (page === "1")
        return new Response(
          JSON.stringify([
            { id: 12, body: "Third", path: "c.ts", position: 3, pull_request_review_id: 2 },
          ]),
        );
      return new Response(JSON.stringify([]));
    }

    return new Response(JSON.stringify([]));
  });
  const { port } = server.addr as Deno.NetAddr;

  const { stdout } = await runGiteaHelper(["pr", "99", "comments"], {
    GITEA_URL: `http://127.0.0.1:${port}`,
  });

  server.shutdown();

  // Verify issues/99/comments was paginated (page 1 only, then stops)
  assert(
    calls.some((c) => c.includes("/issues/99/comments?page=1")),
    "issues comments page 1",
  );

  // Verify reviews pagination
  assert(
    calls.some((c) => c.includes("/pulls/99/reviews?page=1")),
    "reviews page 1",
  );
  assert(
    calls.some((c) => c.includes("/pulls/99/reviews?page=2")),
    "reviews page 2",
  );
  assert(
    calls.some((c) => c.includes("/pulls/99/reviews?page=3")),
    "reviews page 3 (empty)",
  );

  // Verify review comments pagination for review 1 (2 pages + empty)
  assert(
    calls.some((c) => c.includes("/reviews/1/comments?page=1")),
    "review 1 comments page 1",
  );
  assert(
    calls.some((c) => c.includes("/reviews/1/comments?page=2")),
    "review 1 comments page 2",
  );
  assert(
    calls.some((c) => c.includes("/reviews/1/comments?page=3")),
    "review 1 comments page 3 (empty)",
  );

  // Verify review comments pagination for review 2 (1 page + empty)
  assert(
    calls.some((c) => c.includes("/reviews/2/comments?page=1")),
    "review 2 comments page 1",
  );
  assert(
    calls.some((c) => c.includes("/reviews/2/comments?page=2")),
    "review 2 comments page 2 (empty)",
  );

  // Output should list all 3 unresolved comments
  assertStringIncludes(stdout, "First");
  assertStringIncludes(stdout, "Second");
  assertStringIncludes(stdout, "Third");
});
