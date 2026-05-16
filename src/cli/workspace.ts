import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Conventional directories where workspace packages live. We scan
 * these heuristically rather than parsing each tool's workspace
 * config (pnpm-workspace.yaml globs, lerna `packages`, etc.) — full
 * glob expansion lives in BACKLOG.md.
 */
const WORKSPACE_DIRS = ["packages", "apps", "services", "libs"];

/**
 * Filesystem markers that anchor the workspace root.
 */
const WORKSPACE_MARKERS = [
  "pnpm-workspace.yaml",
  "lerna.json",
  "turbo.json",
  "nx.json",
  "rush.json",
];

const CONFIG_FILES = [
  "node-settings.config.ts",
  "node-settings.config.mts",
  "node-settings.config.js",
  "node-settings.config.mjs",
  "node-settings.config.cjs",
  "settings.config.ts",
  "settings.config.mts",
  "settings.config.js",
  "settings.config.mjs",
  "settings.config.cjs",
];

export interface DiscoveredPackage {
  /** Absolute path to the package directory. */
  dir: string;
  /** Absolute path to the package's settings config file. */
  configPath: string;
  /** Short name (basename of the package dir). */
  name: string;
}

/**
 * Walk from `start` toward the filesystem root and return the first
 * directory that looks like a workspace root: it contains one of the
 * `WORKSPACE_MARKERS` or a `.git` directory. Returns `undefined` if
 * no marker is found.
 */
export function findWorkspaceRoot(start: string): string | undefined {
  let dir = resolve(start);
  const visited = new Set<string>();
  while (!visited.has(dir)) {
    visited.add(dir);
    if (WORKSPACE_MARKERS.some((m) => existsSync(resolve(dir, m)))) return dir;
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

/**
 * Heuristically list packages under a workspace root that have a
 * `node-settings.config.*` (or `settings.config.*`) file. Scans
 * `packages/`, `apps/`, `services/`, `libs/`.
 */
export function discoverWorkspacePackages(root: string): DiscoveredPackage[] {
  const found: DiscoveredPackage[] = [];
  for (const wsDir of WORKSPACE_DIRS) {
    const fullDir = resolve(root, wsDir);
    if (!existsSync(fullDir)) continue;
    try {
      if (!statSync(fullDir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const name of readdirSync(fullDir)) {
      const pkgDir = resolve(fullDir, name);
      try {
        if (!statSync(pkgDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const configPath = CONFIG_FILES.map((f) => resolve(pkgDir, f)).find(
        (p) => existsSync(p),
      );
      if (configPath) {
        found.push({ dir: pkgDir, configPath, name });
      }
    }
  }
  // Stable order by name for deterministic CLI output.
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
