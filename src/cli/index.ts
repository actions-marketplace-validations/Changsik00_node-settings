import { parseArgs } from "./args.js";
import { HELP_TEXT } from "./help.js";
import { runValidate } from "./validate.js";
import { runCheck } from "./check.js";
import { runGenerate } from "./generate.js";
import { runInspect } from "./inspect.js";

/**
 * Programmatic entry point for the `node-settings` CLI. Returns the
 * intended process exit code; the bin shim wires it to `process.exit`.
 */
export async function runCli(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);

  if (args.flags.help || args.flags.h || args.positionals.length === 0) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (args.flags.version || args.flags.v) {
    process.stdout.write(`node-settings ${getVersion()}\n`);
    return 0;
  }

  const command = args.positionals[0];
  switch (command) {
    case "validate":
      return runValidate(args);
    case "check":
      return runCheck(args);
    case "inspect":
      return runInspect(args);
    case "generate":
    case "gen":
      return runGenerate(args);
    case "help":
      process.stdout.write(HELP_TEXT);
      return 0;
    default:
      process.stderr.write(`unknown command: ${command}\n\n`);
      process.stderr.write(HELP_TEXT);
      return 2;
  }
}

function getVersion(): string {
  // Resolved at runtime to avoid bundling a package.json import.
  return process.env.npm_package_version ?? "0.0.0";
}
