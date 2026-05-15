import { existsSync } from "node:fs";
import { loadDotenvFile } from "../loaders/dotenv-file.js";
import { loadUserConfig } from "./load-user-config.js";
import type { ParsedArgs } from "./args.js";
import { flagString } from "./args.js";

/**
 * `node-settings validate [env-file]` — load the user's config, build
 * settings against the supplied env file (or `process.env` if none),
 * and exit non-zero if validation fails. Use this in CI to fail PRs
 * that break the production env contract.
 */
export async function runValidate(args: ParsedArgs): Promise<number> {
  const configPath = flagString(args, "config");
  const envFileArg = args.positionals[1] ?? flagString(args, "env-file");

  const { path: resolvedConfig, loader } = await loadUserConfig(configPath);

  let rawEnv: Record<string, string | undefined>;
  let source: string;
  if (envFileArg) {
    if (!existsSync(envFileArg)) {
      console.error(`[node-settings] env file not found: ${envFileArg}`);
      return 2;
    }
    rawEnv = loadDotenvFile(envFileArg);
    source = envFileArg;
  } else {
    rawEnv = process.env;
    source = "process.env";
  }

  try {
    loader(rawEnv);
    console.log(`OK   config=${resolvedConfig}`);
    console.log(`     env=${source}`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL config=${resolvedConfig}`);
    console.error(`     env=${source}`);
    console.error(message);
    return 1;
  }
}
