import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

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
  const server = Deno.serve({ port: 0 }, async (req: Request) => {
    const url = req.url;
    if (url.includes("/pulls/99")) {
      return new Response(JSON.stringify({ number: 99, head: { sha: "abc123" } }));
    }
    if (url.includes("/pulls/99/reviews")) {
      if (req.method === "POST") {
        return new Response(JSON.stringify({ id: 1, html_url: "http://example.com" }));
      }
      return new Response(JSON.stringify([]));
    }
    // Extract PR ID from URL
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
