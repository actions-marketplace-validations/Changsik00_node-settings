import type { z } from "zod";
import { NodeSettingsError } from "./errors.js";

interface ZodDefSnapshot {
  typeName?: string;
}

/**
 * Strip `ZodOptional` / `ZodDefault` / `ZodNullable` layers and return
 * the innermost schema's typeName plus the unwrapped schema. Bounded
 * loop guards against cyclic wrappers.
 */
function unwrapWrappers(schema: z.ZodTypeAny): {
  typeName: string;
  inner: z.ZodTypeAny;
} {
  let inner = schema;
  for (let i = 0; i < 16; i += 1) {
    const typeName = (inner._def as ZodDefSnapshot).typeName;
    if (typeName === "ZodOptional") {
      inner = (inner as z.ZodOptional<z.ZodTypeAny>).unwrap();
    } else if (typeName === "ZodDefault") {
      inner = (inner as z.ZodDefault<z.ZodTypeAny>).removeDefault();
    } else if (typeName === "ZodNullable") {
      inner = (inner as z.ZodNullable<z.ZodTypeAny>).unwrap();
    } else {
      return { typeName: typeName ?? "unknown", inner };
    }
  }
  return { typeName: "unknown", inner };
}

interface ValidatedOptionsInput {
  ownEnvSchema: z.ZodTypeAny;
  resolvedEnvSchema: z.ZodObject<z.ZodRawShape>;
  envKey: string;
  overrideEnvKey: string | undefined;
  resolvedPerEnv: Record<string, unknown>;
  extendsList: ReadonlyArray<unknown>;
}

/**
 * Run all definition-time validations. Throws {@link NodeSettingsError}
 * with a stable `code` on the first problem. Catching problems here —
 * instead of waiting for the first `loader(env)` call — gives clearer
 * stack traces and prevents misconfiguration from shipping to prod.
 */
export function validateDefineSettingsOptions(
  input: ValidatedOptionsInput,
): void {
  // 1. envSchema must be a ZodObject (so introspection + .merge work)
  const ownTypeName = (input.ownEnvSchema._def as ZodDefSnapshot).typeName;
  if (ownTypeName !== "ZodObject") {
    throw new NodeSettingsError(
      "INVALID_ENV_SCHEMA",
      `envSchema must be a z.object({...}). Got ${ownTypeName ?? "unknown"}.`,
      {
        hint: "Refinements / transforms on the outer schema break introspection. Apply them at the field level instead.",
      },
    );
  }

  // 2. envKey must exist in the merged schema
  const shape = input.resolvedEnvSchema.shape;
  const knownKeys = Object.keys(shape);
  if (!(input.envKey in shape)) {
    throw new NodeSettingsError(
      "MISSING_ENV_KEY",
      `envKey '${input.envKey}' is not defined in the envSchema.`,
      { hint: `Known keys: ${knownKeys.join(", ") || "(none)"}` },
    );
  }

  // 3. envKey must resolve to a string-like type (string / enum)
  const envKeyField = shape[input.envKey] as z.ZodTypeAny;
  const { typeName: envKeyType, inner: envKeyInner } = unwrapWrappers(envKeyField);
  if (
    envKeyType !== "ZodString" &&
    envKeyType !== "ZodEnum" &&
    envKeyType !== "ZodNativeEnum"
  ) {
    throw new NodeSettingsError(
      "INVALID_ENV_KEY_TYPE",
      `envKey '${input.envKey}' must resolve to z.string() or z.enum(...) (got ${envKeyType}).`,
      {
        hint: "perEnv looks up branches by envKey's value, so it must be a discrete string.",
      },
    );
  }

  // 4. perEnv basic sanity
  const branchKeys = Object.keys(input.resolvedPerEnv);
  if (branchKeys.length === 0) {
    throw new NodeSettingsError(
      "PER_ENV_EMPTY",
      "perEnv must define at least one environment branch.",
      {
        hint: "Add a branch for every value envKey can take, e.g. perEnv: { local: {...}, prod: {...} }.",
      },
    );
  }

  // 5. If envKey is an enum, perEnv keys must be a *subset* of its values.
  //    We deliberately don't require *every* enum value to have a branch —
  //    the runtime guard handles missing branches, and `node-settings check`
  //    is the right place to enforce completeness.
  if (envKeyType === "ZodEnum") {
    const allowed = (envKeyInner as z.ZodEnum<[string, ...string[]]>).options;
    for (const key of branchKeys) {
      if (!allowed.includes(key)) {
        throw new NodeSettingsError(
          "PER_ENV_KEY_NOT_IN_ENUM",
          `perEnv has branch '${key}', but envKey '${input.envKey}' enum only allows: ${allowed.join(", ")}.`,
          {
            hint: `Either add '${key}' to the enum or remove the perEnv branch (likely a typo).`,
          },
        );
      }
    }
  } else if (envKeyType === "ZodNativeEnum") {
    const values = Object.values(
      (envKeyInner._def as { values?: Record<string, string | number> }).values ??
        {},
    ).filter((v): v is string => typeof v === "string");
    if (values.length > 0) {
      for (const key of branchKeys) {
        if (!values.includes(key)) {
          throw new NodeSettingsError(
            "PER_ENV_KEY_NOT_IN_ENUM",
            `perEnv has branch '${key}', but envKey '${input.envKey}' native enum only allows: ${values.join(", ")}.`,
            {
              hint: `Either add '${key}' to the enum or remove the perEnv branch (likely a typo).`,
            },
          );
        }
      }
    }
  }

  // 6. overrideEnvKey if present must exist in merged schema
  if (input.overrideEnvKey !== undefined) {
    if (!(input.overrideEnvKey in shape)) {
      throw new NodeSettingsError(
        "INVALID_OVERRIDE_KEY",
        `overrideEnvKey '${input.overrideEnvKey}' is not defined in the envSchema.`,
        { hint: `Known keys: ${knownKeys.join(", ") || "(none)"}` },
      );
    }
  }

  // 7. extends must be an array of valid SettingsLoader values.
  //    The runtime merging logic already accesses `.resolved`; we check
  //    eagerly here to produce a clearer error than "Cannot read 'resolved'".
  if (input.extendsList.length > 0) {
    input.extendsList.forEach((parent, idx) => {
      if (
        typeof parent !== "function" ||
        !("resolved" in (parent as unknown as Record<string, unknown>)) ||
        !("envFields" in (parent as unknown as Record<string, unknown>)) ||
        !("opts" in (parent as unknown as Record<string, unknown>))
      ) {
        throw new NodeSettingsError(
          "INVALID_EXTENDS_ITEM",
          `extends[${idx}] is not a valid SettingsLoader.`,
          {
            hint: "Every extends[] entry must be the return value of defineSettings(...).",
          },
        );
      }
    });
  }
}
