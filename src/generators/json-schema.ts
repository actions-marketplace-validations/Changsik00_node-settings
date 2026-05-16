import type { EnvField } from "../introspect.js";

export interface JsonSchemaOptions {
  /** `title` field. Default: `"Environment Variables"`. */
  title?: string;
  /** Optional `$id` URL identifying this schema. */
  $id?: string;
  /** `description` field. */
  description?: string;
  /**
   * Override the `$schema` URL. Default: Draft 2020-12.
   */
  $schema?: string;
  /**
   * When true (default), include the non-standard `x-secret: true`
   * extension on secret fields in addition to `format: "password"`.
   * Some validators only look at one or the other.
   */
  includeXSecret?: boolean;
}

interface JsonSchemaProperty {
  type?: string | string[];
  enum?: readonly string[];
  default?: unknown;
  description?: string;
  format?: string;
  ["x-secret"]?: boolean;
}

interface JsonSchemaDocument {
  $schema: string;
  $id?: string;
  title: string;
  description?: string;
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
}

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/**
 * Generate a JSON Schema document describing the env contract.
 *
 * Useful for:
 *   - **IDE / editor integration** — schema-aware completion in JSON
 *     env config files, validation in CI tooling.
 *   - **AI assistants** — a standard machine-readable description of
 *     what env vars the app expects.
 *   - **OpenAPI bridging** — fold the env contract into a wider API
 *     spec.
 *
 * Returns a pretty-printed JSON string (always ends in a newline).
 */
export function generateJsonSchema(
  fields: readonly EnvField[],
  options: JsonSchemaOptions = {},
): string {
  const includeXSecret = options.includeXSecret ?? true;
  const doc: JsonSchemaDocument = {
    $schema: options.$schema ?? DRAFT_2020_12,
    title: options.title ?? "Environment Variables",
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  };
  if (options.$id !== undefined) doc.$id = options.$id;
  if (options.description !== undefined) doc.description = options.description;

  for (const field of fields) {
    const prop: JsonSchemaProperty = {};
    switch (field.type) {
      case "string":
        prop.type = "string";
        break;
      case "number":
        prop.type = "number";
        break;
      case "boolean":
        prop.type = "boolean";
        break;
      case "enum":
        prop.type = "string";
        if (field.enumValues) prop.enum = field.enumValues;
        break;
      default:
        // Unknown -> permit any; downstream tools can refine.
        break;
    }
    if (field.defaultValue !== undefined) {
      prop.default = field.defaultValue;
    }
    if (field.description) {
      prop.description = field.description;
    }
    if (field.secret) {
      prop.format = "password";
      if (includeXSecret) {
        prop["x-secret"] = true;
      }
    }
    doc.properties[field.key] = prop;
    if (field.required) doc.required.push(field.key);
  }

  // Sort `required` deterministically for stable output across generates.
  doc.required.sort();

  return JSON.stringify(doc, null, 2) + "\n";
}
