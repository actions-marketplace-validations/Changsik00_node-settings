import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverWorkspacePackages,
  findWorkspaceRoot,
} from "./workspace.js";

describe("findWorkspaceRoot", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "node-settings-ws-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns the directory containing pnpm-workspace.yaml", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'");
    mkdirSync(join(root, "packages", "foo"), { recursive: true });
    expect(findWorkspaceRoot(join(root, "packages", "foo"))).toBe(root);
  });

  it("returns the directory containing .git", () => {
    mkdirSync(join(root, ".git"));
    mkdirSync(join(root, "deep", "nested"), { recursive: true });
    expect(findWorkspaceRoot(join(root, "deep", "nested"))).toBe(root);
  });

  it("returns undefined when no marker is found anywhere up the tree", () => {
    const nested = join(root, "x", "y");
    mkdirSync(nested, { recursive: true });
    // No .git, no workspace marker — walks to /tmp then root. Returns undefined.
    // (The tmpdir() itself usually has no markers in CI.)
    const result = findWorkspaceRoot(nested);
    expect(result).toBeUndefined();
  });
});

describe("discoverWorkspacePackages", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "node-settings-ws-disc-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds packages with a settings config under packages/", () => {
    mkdirSync(join(root, "packages", "alpha"), { recursive: true });
    mkdirSync(join(root, "packages", "beta"), { recursive: true });
    writeFileSync(join(root, "packages", "alpha", "settings.config.ts"), "");
    writeFileSync(
      join(root, "packages", "beta", "node-settings.config.ts"),
      "",
    );
    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["alpha", "beta"]);
    expect(found[0]!.configPath).toBe(
      join(root, "packages", "alpha", "settings.config.ts"),
    );
  });

  it("scans apps/, services/, libs/ in addition to packages/", () => {
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    mkdirSync(join(root, "services", "billing"), { recursive: true });
    mkdirSync(join(root, "libs", "shared"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "settings.config.ts"), "");
    writeFileSync(
      join(root, "services", "billing", "node-settings.config.ts"),
      "",
    );
    writeFileSync(join(root, "libs", "shared", "settings.config.mjs"), "");
    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name).sort()).toEqual([
      "billing",
      "shared",
      "web",
    ]);
  });

  it("skips package directories without a config file", () => {
    mkdirSync(join(root, "packages", "no-config"), { recursive: true });
    mkdirSync(join(root, "packages", "with-config"), { recursive: true });
    writeFileSync(
      join(root, "packages", "with-config", "settings.config.ts"),
      "",
    );
    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["with-config"]);
  });

  it("returns [] when no workspace dirs exist at all", () => {
    expect(discoverWorkspacePackages(root)).toEqual([]);
  });
});
