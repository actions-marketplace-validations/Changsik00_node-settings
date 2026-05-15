import { existsSync } from "node:fs";
import { loadDotenvFile } from "../loaders/dotenv-file.js";
import { checkPerEnvCompleteness } from "../check-per-env.js";
import { loadUserConfig } from "./load-user-config.js";
import type { ParsedArgs } from "./args.js";
import { flagBool, flagString } from "./args.js";

/**
 * `node-settings check --env <name>` — verify a per-env branch is
 * complete enough to deploy: no `TODO-` placeholders, no empty strings
 * in required slots, and (if env files are supplied) every required env
 * var actually present.
 */
export async function runCheck(args: ParsedArgs): Promise<number> {
  const configPath = flagString(args, "config");
  const envFilter = flagString(args, "env");
  const allowWarnings = flagBool(args, "allow-warnings", true);

  const { path: resolvedConfig, loader } = await loadUserConfig(configPath);

  const envValues: Record<string, Record<string, string>> = {};
  const envFileSpec = flagString(args, "env-file");
  if (envFileSpec) {
    for (const pair of envFileSpec.split(",")) {
      const [envName, filePath] = pair.split("=");
      if (!envName || !filePath) {
        console.error(
          `[node-settings] --env-file expects name=path[,name=path...]`,
        );
        return 2;
      }
      if (!existsSync(filePath)) {
        console.error(`[node-settings] env file not found: ${filePath}`);
        return 2;
      }
      envValues[envName] = loadDotenvFile(filePath);
    }
  }

  const envs = envFilter ? envFilter.split(",") : undefined;
  const report = checkPerEnvCompleteness(loader, {
    envs,
    envValues,
  });

  console.log(`config=${resolvedConfig}`);
  console.log("");

  for (const [env, counts] of Object.entries(report.countsByEnv)) {
    const status =
      counts.errors > 0 ? "FAIL" : counts.warnings > 0 ? "WARN" : "OK  ";
    console.log(
      `${status} ${env}  errors=${counts.errors}  warnings=${counts.warnings}`,
    );
  }

  if (report.issues.length > 0) {
    console.log("");
    for (const issue of report.issues) {
      const tag = issue.severity === "error" ? "ERR " : "WARN";
      console.log(`${tag} [${issue.env}] ${issue.path}: ${issue.message}`);
    }
  }

  if (!report.ok) return 1;
  if (!allowWarnings && report.issues.some((i) => i.severity === "warning")) {
    return 1;
  }
  return 0;
}
