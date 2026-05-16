import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineClientEnv } from "./client-env.js";
import { NodeSettingsError } from "./errors.js";

describe("defineClientEnv — prefix enforcement (definition time)", () => {
  it("throws CLIENT_ENV_PREFIX_VIOLATION when a schema key omits the prefix", () => {
    expect(() =>
      defineClientEnv({
        prefix: "VITE_",
        schema: z.object({
          VITE_OK: z.string(),
          // missing prefix on purpose
          DATABASE_URL: z.string(),
        }),
      }),
    ).toThrow(NodeSettingsError);
  });

  it("the thrown error carries the violating keys in its message", () => {
    try {
      defineClientEnv({
        prefix: "NEXT_PUBLIC_",
        schema: z.object({
          BAD_ONE: z.string(),
          BAD_TWO: z.string(),
        }),
      });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(NodeSettingsError);
      const nse = err as NodeSettingsError;
      expect(nse.code).toBe("CLIENT_ENV_PREFIX_VIOLATION");
      expect(nse.message).toContain("'BAD_ONE'");
      expect(nse.message).toContain("'BAD_TWO'");
      expect(nse.message).toContain("NEXT_PUBLIC_");
    }
  });

  it("throws when prefix is empty / non-string", () => {
    expect(() =>
      defineClientEnv({
        prefix: "",
        schema: z.object({ FOO: z.string() }),
      }),
    ).toThrow(/prefix must be a non-empty string/);
  });

  it("accepts a schema whose keys all start with the prefix", () => {
    expect(() =>
      defineClientEnv({
        prefix: "VITE_",
        schema: z.object({
          VITE_A: z.string(),
          VITE_B: z.string(),
        }),
      }),
    ).not.toThrow();
  });
});

describe("defineClientEnv — runtime filtering + validation", () => {
  it("filters out server-only keys before zod sees them", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      schema: z.object({
        VITE_API_URL: z.string().url(),
      }),
    });
    const resolved = clientEnv({
      VITE_API_URL: "https://example.com",
      DATABASE_URL: "postgres://super-secret",
      AWS_SECRET_ACCESS_KEY: "leak-me",
    });
    expect(resolved.VITE_API_URL).toBe("https://example.com");
    expect((resolved as Record<string, unknown>).DATABASE_URL).toBeUndefined();
    expect(
      (resolved as Record<string, unknown>).AWS_SECRET_ACCESS_KEY,
    ).toBeUndefined();
  });

  it("wraps zod errors as CLIENT_ENV_VALIDATION_FAILED", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      schema: z.object({
        VITE_API_URL: z.string().url(),
      }),
    });
    try {
      clientEnv({ VITE_API_URL: "not-a-url" });
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(NodeSettingsError);
      const nse = err as NodeSettingsError;
      expect(nse.code).toBe("CLIENT_ENV_VALIDATION_FAILED");
      expect(nse.cause).toBeInstanceOf(z.ZodError);
    }
  });

  it("missing required key surfaces the zod issue path", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      schema: z.object({
        VITE_API_URL: z.string(),
      }),
    });
    try {
      clientEnv({}); // missing VITE_API_URL
      expect.fail("expected throw");
    } catch (err) {
      const nse = err as NodeSettingsError;
      expect(nse.code).toBe("CLIENT_ENV_VALIDATION_FAILED");
      expect(nse.message).toContain("VITE_API_URL");
    }
  });

  it("respects schema defaults for optional keys", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      schema: z.object({
        VITE_API_URL: z.string().default("https://default.example.com"),
        VITE_SENTRY_DSN: z.string().optional(),
      }),
    });
    const resolved = clientEnv({});
    expect(resolved.VITE_API_URL).toBe("https://default.example.com");
    expect(resolved.VITE_SENTRY_DSN).toBeUndefined();
  });

  it("treats undefined values in source as absent", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      schema: z.object({
        VITE_OPT: z.string().optional(),
      }),
    });
    const resolved = clientEnv({ VITE_OPT: undefined });
    expect(resolved.VITE_OPT).toBeUndefined();
  });
});

describe("defineClientEnv — strict mode", () => {
  it("throws CLIENT_ENV_UNDECLARED when a prefix-matching key is not in the schema", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      strict: true,
      schema: z.object({
        VITE_API_URL: z.string(),
      }),
    });
    try {
      clientEnv({
        VITE_API_URL: "https://x.example.com",
        VITE_TYPO_KEY: "leaked",
      });
      expect.fail("expected throw");
    } catch (err) {
      const nse = err as NodeSettingsError;
      expect(nse.code).toBe("CLIENT_ENV_UNDECLARED");
      expect(nse.message).toContain("VITE_TYPO_KEY");
    }
  });

  it("strict mode still ignores server-only keys (no prefix)", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      strict: true,
      schema: z.object({
        VITE_API_URL: z.string(),
      }),
    });
    expect(() =>
      clientEnv({
        VITE_API_URL: "https://x.example.com",
        DATABASE_URL: "postgres://no-leak",
      }),
    ).not.toThrow();
  });

  it("non-strict (default) silently ignores extra prefix keys", () => {
    const clientEnv = defineClientEnv({
      prefix: "VITE_",
      schema: z.object({
        VITE_A: z.string(),
      }),
    });
    expect(() => clientEnv({ VITE_A: "x", VITE_EXTRA: "ignored" })).not.toThrow();
  });
});

describe("defineClientEnv — typical framework prefixes", () => {
  it("works with NEXT_PUBLIC_ prefix", () => {
    const clientEnv = defineClientEnv({
      prefix: "NEXT_PUBLIC_",
      schema: z.object({
        NEXT_PUBLIC_API_URL: z.string().url(),
      }),
    });
    const resolved = clientEnv({
      NEXT_PUBLIC_API_URL: "https://api.example.com",
      DATABASE_URL: "secret",
    });
    expect(resolved.NEXT_PUBLIC_API_URL).toBe("https://api.example.com");
  });

  it("works with PUBLIC_ prefix (Astro / SvelteKit)", () => {
    const clientEnv = defineClientEnv({
      prefix: "PUBLIC_",
      schema: z.object({
        PUBLIC_SITE_URL: z.string().url(),
      }),
    });
    const resolved = clientEnv({
      PUBLIC_SITE_URL: "https://site.example.com",
    });
    expect(resolved.PUBLIC_SITE_URL).toBe("https://site.example.com");
  });
});
