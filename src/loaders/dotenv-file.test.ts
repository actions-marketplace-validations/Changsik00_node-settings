import { describe, expect, it } from "vitest";
import { parseDotenv } from "./dotenv-file.js";

describe("parseDotenv", () => {
  it("parses simple KEY=value pairs", () => {
    expect(parseDotenv("FOO=bar\nBAZ=qux")).toEqual({
      FOO: "bar",
      BAZ: "qux",
    });
  });

  it("ignores comments and blank lines", () => {
    const env = parseDotenv(`
# leading comment
FOO=bar

# another
BAZ=qux
`);
    expect(env).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips surrounding double and single quotes", () => {
    const env = parseDotenv(`FOO="hello world"\nBAR='single'`);
    expect(env.FOO).toBe("hello world");
    expect(env.BAR).toBe("single");
  });

  it("strips inline comments from unquoted values", () => {
    expect(parseDotenv("FOO=bar # comment").FOO).toBe("bar");
  });

  it("preserves '#' inside quoted values", () => {
    expect(parseDotenv('FOO="has # in it"').FOO).toBe("has # in it");
  });
});
