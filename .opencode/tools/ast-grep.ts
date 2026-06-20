import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Structural code search and replace using ast-grep (sg)",
  args: {
    pattern: tool.schema
      .string()
      .describe(
        "AST pattern to search. Use $META for wildcards (e.g. 'console.log($A)'). Omit and use --kind to search by AST node kind.",
      ),
    kind: tool.schema
      .string()
      .optional()
      .describe(
        "AST node kind to match (e.g. 'function_declaration', 'arrow_function'). Alternative to --pattern.",
      ),
    paths: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("File paths or directories to search. Defaults to '.'"),
    lang: tool.schema.string().optional().describe("Language (e.g. 'ts', 'js')"),
    rewrite: tool.schema.string().optional().describe("Rewrite pattern for replacement"),
    filesWithMatches: tool.schema
      .boolean()
      .optional()
      .describe("Print only file paths with matches"),
    json: tool.schema.boolean().optional().describe("Output matches as JSON"),
    context: tool.schema
      .number()
      .optional()
      .describe("Show NUM lines of context around each match"),
  },
  async execute(args) {
    const cmdArgs: string[] = [];
    if (args.pattern) cmdArgs.push("-p", args.pattern);
    if (args.kind) cmdArgs.push("--kind", args.kind);
    if (args.lang) cmdArgs.push("-l", args.lang);
    if (args.rewrite) cmdArgs.push("-r", args.rewrite);
    if (args.filesWithMatches) cmdArgs.push("--files-with-matches");
    if (args.json) cmdArgs.push("--json");
    if (args.context) cmdArgs.push("-C", String(args.context));
    if (args.paths && args.paths.length > 0) cmdArgs.push(...args.paths);
    const command = new Deno.Command("sg", { args: cmdArgs });
    const { stdout } = await command.output();
    return new TextDecoder().decode(stdout).trim();
  },
});
