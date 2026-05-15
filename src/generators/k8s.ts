import type { EnvField } from "../introspect.js";

export interface K8sManifestOptions {
  /** Base name used for both the ConfigMap and the Secret. Required. */
  name: string;
  /** Kubernetes namespace. Default: omitted (uses the deploy-time default). */
  namespace?: string;
  /** Suffix appended to the ConfigMap name. Default: `'-config'`. */
  configMapSuffix?: string;
  /** Suffix appended to the Secret name. Default: `'-secret'`. */
  secretSuffix?: string;
  /**
   * Values for non-secret fields. Defaults inferred from the schema are
   * used when a key is missing. Required fields with no schema default
   * and no value here are emitted with an empty string and a TODO comment.
   */
  values?: Record<string, string | number | boolean>;
  /** Labels applied to both manifests. */
  labels?: Record<string, string>;
  /** Annotations applied to both manifests. */
  annotations?: Record<string, string>;
  /**
   * If true, secret values come from the `values` map encoded as base64
   * (Secret `data` field). If false (default), secret keys are listed
   * under `stringData` with empty placeholders — the operator fills them
   * in via `kubectl edit` or a sealed-secret/vault workflow.
   */
  inlineSecretValues?: boolean;
  /** End-of-line. Default: `"\n"`. */
  eol?: string;
}

export interface K8sManifestResult {
  /** Combined YAML document (ConfigMap + Secret separated by `---`). */
  yaml: string;
  /** ConfigMap YAML only. */
  configMap: string;
  /** Secret YAML only, or empty string if the schema has no secret fields. */
  secret: string;
}

/**
 * Generate Kubernetes ConfigMap and Secret manifests from introspected
 * env field metadata. Secret fields (auto-detected or `@secret`-tagged)
 * land in the Secret; everything else lands in the ConfigMap.
 *
 * Typical workflow:
 *   1. Commit the ConfigMap YAML to the infra repo.
 *   2. Fill in the Secret YAML via Sealed Secrets / Vault / External
 *      Secrets, or run `kubectl create secret generic ...` directly.
 */
export function generateK8sManifests(
  fields: readonly EnvField[],
  options: K8sManifestOptions,
): K8sManifestResult {
  if (!options.name) {
    throw new Error("[node-settings] generateK8sManifests requires `name`.");
  }
  const eol = options.eol ?? "\n";
  const configMapSuffix = options.configMapSuffix ?? "-config";
  const secretSuffix = options.secretSuffix ?? "-secret";

  const configFields = fields.filter((f) => !f.secret);
  const secretFields = fields.filter((f) => f.secret);

  const configMap = renderConfigMap(
    `${options.name}${configMapSuffix}`,
    configFields,
    options,
    eol,
  );
  const secret =
    secretFields.length > 0
      ? renderSecret(
          `${options.name}${secretSuffix}`,
          secretFields,
          options,
          eol,
        )
      : "";

  const yaml = secret
    ? `${configMap}---${eol}${secret}`
    : configMap;

  return { yaml, configMap, secret };
}

function renderConfigMap(
  name: string,
  fields: readonly EnvField[],
  options: K8sManifestOptions,
  eol: string,
): string {
  const lines: string[] = [];
  lines.push("apiVersion: v1");
  lines.push("kind: ConfigMap");
  lines.push("metadata:");
  lines.push(`  name: ${name}`);
  if (options.namespace) lines.push(`  namespace: ${options.namespace}`);
  pushLabels(lines, options.labels, "  ");
  pushAnnotations(lines, options.annotations, "  ");
  lines.push("data:");
  if (fields.length === 0) {
    lines.push("  # (no non-secret env vars defined in the schema)");
  } else {
    for (const field of fields) {
      const value = resolveValue(field, options.values);
      const needsTodo = field.required && value === "";
      if (needsTodo) {
        lines.push(`  # TODO: required, no default — provide before deploy`);
      }
      if (field.description) {
        for (const descLine of field.description.split(/\r?\n/)) {
          lines.push(`  # ${descLine}`);
        }
      }
      lines.push(`  ${field.key}: ${quote(value)}`);
    }
  }
  return lines.join(eol) + eol;
}

function renderSecret(
  name: string,
  fields: readonly EnvField[],
  options: K8sManifestOptions,
  eol: string,
): string {
  const lines: string[] = [];
  lines.push("apiVersion: v1");
  lines.push("kind: Secret");
  lines.push("metadata:");
  lines.push(`  name: ${name}`);
  if (options.namespace) lines.push(`  namespace: ${options.namespace}`);
  pushLabels(lines, options.labels, "  ");
  pushAnnotations(lines, options.annotations, "  ");
  lines.push("type: Opaque");

  if (options.inlineSecretValues) {
    lines.push("data:");
    for (const field of fields) {
      const value = resolveValue(field, options.values);
      const encoded = Buffer.from(value, "utf8").toString("base64");
      lines.push(`  ${field.key}: ${encoded}`);
    }
  } else {
    lines.push("stringData:");
    for (const field of fields) {
      const provided = options.values?.[field.key];
      const value =
        provided !== undefined ? String(provided) : "REPLACE_ME";
      lines.push(`  # ${field.key} (${field.required ? "required" : "optional"})`);
      if (field.description) {
        for (const descLine of field.description.split(/\r?\n/)) {
          lines.push(`  # ${descLine}`);
        }
      }
      lines.push(`  ${field.key}: ${quote(value)}`);
    }
  }
  return lines.join(eol) + eol;
}

function resolveValue(
  field: EnvField,
  values: K8sManifestOptions["values"],
): string {
  const provided = values?.[field.key];
  if (provided !== undefined) return String(provided);
  if (field.defaultValue !== undefined) return String(field.defaultValue);
  return "";
}

function pushLabels(
  lines: string[],
  labels: Record<string, string> | undefined,
  indent: string,
): void {
  if (!labels) return;
  const keys = Object.keys(labels);
  if (keys.length === 0) return;
  lines.push(`${indent}labels:`);
  for (const key of keys) {
    const value = labels[key] as string;
    lines.push(`${indent}  ${key}: ${quote(value)}`);
  }
}

function pushAnnotations(
  lines: string[],
  annotations: Record<string, string> | undefined,
  indent: string,
): void {
  if (!annotations) return;
  const keys = Object.keys(annotations);
  if (keys.length === 0) return;
  lines.push(`${indent}annotations:`);
  for (const key of keys) {
    const value = annotations[key] as string;
    lines.push(`${indent}  ${key}: ${quote(value)}`);
  }
}

/**
 * Always emit values as double-quoted YAML strings. Avoids the pitfall
 * where YAML 1.1 parsers coerce `yes`/`no`/`on`/`off`/`true`/`false` to
 * booleans, or numeric-looking strings to numbers.
 */
function quote(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}
