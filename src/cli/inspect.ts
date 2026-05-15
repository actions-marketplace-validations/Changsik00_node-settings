import type { ParsedArgs } from "./args.js";
import { flagString } from "./args.js";
import { loadUserConfig } from "./load-user-config.js";
import { deepMerge } from "../utils/deep-merge.js";
import type { EnvField } from "../introspect.js";

/**
 * `node-settings inspect [--env <name>]` — show what env contract and
 * layered config (defaults + perEnv[mode]) resolve to at a given env.
 *
 * Runs in *dry mode*: it does not call the loader, so no env values
 * (and no secrets) are required. Useful for answering "what does my
 * prod config actually look like?" without needing prod credentials.
 */
export async function runInspect(args: ParsedArgs): Promise<number> {
  const configPath = flagString(args, "config");
  const { path: resolvedPath, loader } = await loadUserConfig(configPath);

  const branches = Object.keys(loader.resolved.perEnv);
  const requestedEnvs = flagString(args, "env")?.split(",");
  const targetEnvs = requestedEnvs ?? branches;

  console.log(`config=${resolvedPath}`);
  console.log(`envKey=${loader.resolved.envKey}`);
  if (loader.resolved.overrideEnvKey) {
    console.log(`overrideEnvKey=${loader.resolved.overrideEnvKey}`);
  }
  console.log("");

  console.log("env schema (the contract):");
  for (const field of loader.envFields) {
    console.log(`  ${formatEnvField(field)}`);
  }
  console.log("");

  for (const env of targetEnvs) {
    const branch = loader.resolved.perEnv[env];
    if (!branch) {
      console.error(`! ${env}: no perEnv branch defined`);
      continue;
    }
    const layered = deepMerge(
      loader.resolved.defaults as Record<string, unknown>,
      branch as Record<string, unknown>,
    );
    console.log(`layered config for ${loader.resolved.envKey}=${env}:`);
    printConfig(layered, "  ");
    console.log("");
  }

  return 0;
}

function formatEnvField(field: EnvField): string {
  const tags: string[] = [field.type];
  if (field.required) tags.push("required");
  else tags.push("optional");
  if (field.enumValues) tags.push(`enum: ${field.enumValues.join("|")}`);
  if (field.defaultValue !== undefined && !field.secret) {
    tags.push(`default: ${JSON.stringify(field.defaultValue)}`);
  }
  if (field.secret) tags.push("secret");
  const desc = field.description ? ` — ${field.description}` : "";
  return `${field.key} (${tags.join(", ")})${desc}`;
}

function printConfig(value: unknown, indent: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    console.log(`${indent}${JSON.stringify(value)}`);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      child !== null &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      Object.keys(child as Record<string, unknown>).length > 0
    ) {
      console.log(`${indent}${key}:`);
      printConfig(child, indent + "  ");
    } else {
      console.log(`${indent}${key}: ${JSON.stringify(child)}`);
    }
  }
}
