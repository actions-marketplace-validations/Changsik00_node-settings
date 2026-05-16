import { existsSync } from "node:fs";
import { relative } from "node:path";
import { loadDotenvFile } from "../loaders/dotenv-file.js";
import { checkPerEnvCompleteness } from "../check-per-env.js";
import { loadUserConfig } from "./load-user-config.js";
import {
  discoverWorkspacePackages,
  findWorkspaceRoot,
} from "./workspace.js";
import type { ParsedArgs } from "./args.js";
import { flagBool, flagString } from "./args.js";

/**
 * `node-settings check [--env <name>] [--workspace]` — verify per-env
 * branches are complete enough to deploy. Reports placeholder values,
 * unfilled `todo()` sentinels, secret-looking keys placed in `perEnv`,
 * and missing required env vars.
 *
 * With `--workspace`, walks up to the workspace root and runs the
 * check against every package found under `packages/`, `apps/`,
 * `services/`, `libs/` that has a `node-settings.config.*` (or
 * `settings.config.*`) file. Exit code aggregates the worst result.
 */
export async function runCheck(args: ParsedArgs): Promise<number> {
  if (flagBool(args, "workspace")) {
    return runCheckWorkspace(args);
  }
  const configPath = flagString(args, "config");
  return runCheckSingle(configPath, args);
}

async function runCheckSingle(
  configPath: string | undefined,
  args: ParsedArgs,
): Promise<number> {
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
    ...(envs ? { envs } : {}),
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

async function runCheckWorkspace(args: ParsedArgs): Promise<number> {
  const cwd = process.cwd();
  const root = findWorkspaceRoot(cwd) ?? cwd;
  const packages = discoverWorkspacePackages(root);
  if (packages.length === 0) {
    console.error(
      `[node-settings] --workspace: no packages with a settings config found under ${root}`,
    );
    console.error(
      "  scanned: packages/*, apps/*, services/*, libs/*",
    );
    return 2;
  }

  console.log(`workspace root: ${root}`);
  console.log(`packages: ${packages.length}`);
  console.log("");

  let worst = 0;
  for (const pkg of packages) {
    const rel = relative(root, pkg.configPath);
    console.log(`=== ${pkg.name} (${rel}) ===`);
    const code = await runCheckSingle(pkg.configPath, args);
    if (code > worst) worst = code;
    console.log("");
  }
  return worst;
}
