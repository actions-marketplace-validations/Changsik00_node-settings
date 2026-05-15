import { describe, expect, it } from "vitest";
import { parseArgs, flagBool, flagString } from "./args.js";

describe("parseArgs", () => {
  it("collects positionals and flag-with-value pairs", () => {
    const r = parseArgs(["generate", "k8s", "--name", "svc", "--namespace=prod"]);
    expect(r.positionals).toEqual(["generate", "k8s"]);
    expect(r.flags.name).toBe("svc");
    expect(r.flags.namespace).toBe("prod");
  });

  it("treats trailing flags with no value as booleans", () => {
    const r = parseArgs(["check", "--allow-warnings"]);
    expect(r.flags["allow-warnings"]).toBe(true);
  });

  it("handles `--` terminator", () => {
    const r = parseArgs(["validate", "--", "--literal", "value"]);
    expect(r.positionals).toEqual(["validate", "--literal", "value"]);
  });

  it("flagString returns undefined for boolean flags", () => {
    const r = parseArgs(["--verbose"]);
    expect(flagString(r, "verbose")).toBeUndefined();
  });

  it("flagBool defaults to false", () => {
    const r = parseArgs([]);
    expect(flagBool(r, "verbose")).toBe(false);
    expect(flagBool(r, "verbose", true)).toBe(true);
  });
});
