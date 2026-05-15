import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findConfigUpwards } from "./load-user-config.js";

describe("findConfigUpwards", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "node-settings-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds a config in the starting directory", () => {
    writeFileSync(join(root, "node-settings.config.js"), "");
    expect(findConfigUpwards(root)).toBe(
      join(root, "node-settings.config.js"),
    );
  });

  it("walks up parent directories until a config is found", () => {
    writeFileSync(join(root, "node-settings.config.js"), "");
    const nested = join(root, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    expect(findConfigUpwards(nested)).toBe(
      join(root, "node-settings.config.js"),
    );
  });

  it("stops walking when it hits a .git directory without a config", () => {
    // Repo root has .git but no config.
    mkdirSync(join(root, ".git"));
    const nested = join(root, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    expect(findConfigUpwards(nested)).toBeUndefined();
  });

  it("stops at a pnpm workspace marker", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: ['packages/*']");
    const nested = join(root, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    expect(findConfigUpwards(nested)).toBeUndefined();
  });

  it("returns the config at the workspace root even when .git is present", () => {
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "node-settings.config.ts"), "");
    const nested = join(root, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    expect(findConfigUpwards(nested)).toBe(
      join(root, "node-settings.config.ts"),
    );
  });

  it("prefers the closer config when both ancestor and descendant have one", () => {
    writeFileSync(join(root, "node-settings.config.js"), "// root");
    const nested = join(root, "packages", "foo");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "settings.config.ts"), "// nested");
    expect(findConfigUpwards(nested)).toBe(
      join(nested, "settings.config.ts"),
    );
  });
});
