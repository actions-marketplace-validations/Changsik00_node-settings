import { describe, expect, it } from "vitest";
import { deepMerge } from "./deep-merge.js";

describe("deepMerge", () => {
  it("returns a shallow copy when source is undefined", () => {
    const target = { a: 1, b: { c: 2 } };
    const result = deepMerge(target, undefined);
    expect(result).toEqual(target);
    expect(result).not.toBe(target);
  });

  it("leaves the target untouched when source is empty", () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("overwrites primitive values", () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: 99 })).toEqual({ a: 99, b: 2 });
  });

  it("adds keys that exist only on the source", () => {
    expect(deepMerge<Record<string, unknown>>({ a: 1 }, { b: 2 })).toEqual({
      a: 1,
      b: 2,
    });
  });

  it("merges nested objects recursively", () => {
    const target = { db: { host: "a", port: 3306 }, retry: 3 };
    const source = { db: { host: "b" } };
    expect(deepMerge(target, source)).toEqual({
      db: { host: "b", port: 3306 },
      retry: 3,
    });
  });

  it("replaces arrays rather than concatenating", () => {
    const target = { langs: ["en", "ko"] };
    const source = { langs: ["ja"] };
    expect(deepMerge(target, source)).toEqual({ langs: ["ja"] });
  });

  it("allows null to overwrite a string", () => {
    expect(
      deepMerge<Record<string, unknown>>({ a: "old" }, { a: null }),
    ).toEqual({ a: null });
  });

  it("treats class instances as opaque (replace, do not merge)", () => {
    class Foo {
      x = 1;
    }
    const target = { item: new Foo() };
    const source = { item: { x: 99 } as Foo };
    const result = deepMerge(target, source);
    expect(result.item.x).toBe(99);
  });
});
