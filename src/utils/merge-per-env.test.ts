import { describe, expect, it } from "vitest";
import { mergePerEnv } from "./merge-per-env.js";

interface Cfg {
  bucket: string;
  region: string;
  flags: { newCheckout: boolean };
}

describe("mergePerEnv", () => {
  it("deep-merges branches per env key", () => {
    const result = mergePerEnv<Cfg>(
      {
        local: { region: "local", flags: { newCheckout: false } },
        prod: { region: "us-east-1", flags: { newCheckout: false } },
      },
      {
        local: { bucket: "local-b" },
        prod: { bucket: "prod-b", flags: { newCheckout: true } },
      },
    );
    expect(result.local).toEqual({
      region: "local",
      flags: { newCheckout: false },
      bucket: "local-b",
    });
    expect(result.prod).toEqual({
      region: "us-east-1",
      flags: { newCheckout: true },
      bucket: "prod-b",
    });
  });

  it("includes env keys that exist only in overrides", () => {
    const result = mergePerEnv<Cfg>(
      { local: { region: "x", flags: { newCheckout: false }, bucket: "" } },
      { staging: { bucket: "stage" } },
    );
    expect(Object.keys(result).sort()).toEqual(["local", "staging"]);
  });

  it("chains multiple overrides in order", () => {
    const result = mergePerEnv<Cfg>(
      { prod: { region: "us-east-1", flags: { newCheckout: false }, bucket: "" } },
      { prod: { region: "us-west-2" } },
      { prod: { bucket: "final" } },
    );
    expect(result.prod).toEqual({
      region: "us-west-2",
      flags: { newCheckout: false },
      bucket: "final",
    });
  });
});
