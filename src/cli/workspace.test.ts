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

describe("discoverWorkspacePackages — pnpm-workspace.yaml", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "node-settings-ws-pnpm-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("uses pnpm-workspace.yaml globs over the heuristic dirs", () => {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'workspaces/*'\n",
    );
    // Heuristic dirs are present but should NOT be scanned because
    // pnpm-workspace.yaml takes priority.
    mkdirSync(join(root, "packages", "ignored"), { recursive: true });
    writeFileSync(
      join(root, "packages", "ignored", "settings.config.ts"),
      "",
    );
    mkdirSync(join(root, "workspaces", "alpha"), { recursive: true });
    writeFileSync(
      join(root, "workspaces", "alpha", "settings.config.ts"),
      "",
    );

    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["alpha"]);
  });

  it("respects negation patterns (!pattern)", () => {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n  - '!packages/private'\n",
    );
    mkdirSync(join(root, "packages", "public-a"), { recursive: true });
    mkdirSync(join(root, "packages", "public-b"), { recursive: true });
    mkdirSync(join(root, "packages", "private"), { recursive: true });
    writeFileSync(
      join(root, "packages", "public-a", "settings.config.ts"),
      "",
    );
    writeFileSync(
      join(root, "packages", "public-b", "settings.config.ts"),
      "",
    );
    writeFileSync(
      join(root, "packages", "private", "settings.config.ts"),
      "",
    );

    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["public-a", "public-b"]);
  });

  it("supports ** recursive glob (apps/**/* style)", () => {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'apps/**'\n",
    );
    mkdirSync(join(root, "apps", "web", "deep", "nested"), { recursive: true });
    writeFileSync(
      join(root, "apps", "web", "deep", "nested", "settings.config.ts"),
      "",
    );

    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["nested"]);
  });

  it("an explicit empty packages list returns [] (does NOT fall back)", () => {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages: []\n",
    );
    // Heuristic dirs are present and would match without the explicit override.
    mkdirSync(join(root, "packages", "alpha"), { recursive: true });
    writeFileSync(
      join(root, "packages", "alpha", "settings.config.ts"),
      "",
    );

    expect(discoverWorkspacePackages(root)).toEqual([]);
  });

  it("skips node_modules even if it would otherwise match the glob", () => {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'node_modules/*'\n",
    );
    mkdirSync(join(root, "node_modules", "fake-pkg"), { recursive: true });
    writeFileSync(
      join(root, "node_modules", "fake-pkg", "settings.config.ts"),
      "",
    );

    expect(discoverWorkspacePackages(root)).toEqual([]);
  });
});

describe("discoverWorkspacePackages — package.json workspaces", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "node-settings-ws-npm-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads the array form: { workspaces: ['packages/*'] }", () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ workspaces: ["packages/*"] }),
    );
    mkdirSync(join(root, "packages", "alpha"), { recursive: true });
    writeFileSync(
      join(root, "packages", "alpha", "settings.config.ts"),
      "",
    );

    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["alpha"]);
  });

  it("reads the object form: { workspaces: { packages: ['packages/*'] } }", () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        workspaces: { packages: ["packages/*"] },
      }),
    );
    mkdirSync(join(root, "packages", "alpha"), { recursive: true });
    writeFileSync(
      join(root, "packages", "alpha", "settings.config.ts"),
      "",
    );

    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["alpha"]);
  });

  it("pnpm-workspace.yaml beats package.json workspaces when both exist", () => {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'pnpm-dir/*'\n",
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ workspaces: ["npm-dir/*"] }),
    );
    mkdirSync(join(root, "pnpm-dir", "alpha"), { recursive: true });
    mkdirSync(join(root, "npm-dir", "beta"), { recursive: true });
    writeFileSync(
      join(root, "pnpm-dir", "alpha", "settings.config.ts"),
      "",
    );
    writeFileSync(
      join(root, "npm-dir", "beta", "settings.config.ts"),
      "",
    );

    const found = discoverWorkspacePackages(root);
    expect(found.map((p) => p.name)).toEqual(["alpha"]);
  });
});
