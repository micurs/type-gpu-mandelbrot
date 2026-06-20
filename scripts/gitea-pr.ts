// DEPRECATED: Use gitea-helper.ts instead.
//   deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr <command>

console.error("[DEPRECATED] gitea-pr.ts is deprecated. Use gitea-helper.ts instead.");
console.error(
  "  e.g. deno run --allow-env --allow-net --allow-read scripts/gitea-helper.ts pr " +
    Deno.args.join(" "),
);

const cmd = new Deno.Command(Deno.execPath(), {
  args: [
    "run",
    "--allow-env",
    "--allow-net",
    "--allow-read",
    new URL("gitea-helper.ts", import.meta.url).pathname,
    "pr",
    ...Deno.args,
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await cmd.output();
Deno.exit(code);
