import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateEnvExample,
  generatePerEnvExamples,
} from "../generators/env-example.js";
import { generateMarkdownDocs } from "../generators/markdown.js";
import { generateK8sManifests } from "../generators/k8s.js";
import { generateJsonSchema } from "../generators/json-schema.js";
import { loadUserConfig } from "./load-user-config.js";
import type { ParsedArgs } from "./args.js";
import { flagBool, flagString } from "./args.js";

/**
 * `node-settings generate <target>` — render `.env.example`, Markdown
 * docs, or Kubernetes manifests from the user's schema. Output is
 * written to `--out <path>` or printed to stdout.
 */
export async function runGenerate(args: ParsedArgs): Promise<number> {
  const target = args.positionals[1];
  if (!target) {
    console.error(
      "[node-settings] generate <target> required. Targets: env-example, envs, docs, k8s, json-schema",
    );
    return 2;
  }

  const configPath = flagString(args, "config");
  const outPath = flagString(args, "out");
  const { loader } = await loadUserConfig(configPath);

  let output: string;
  switch (target) {
    case "env-example":
    case "env": {
      output = generateEnvExample(loader.envFields);
      break;
    }
    case "envs":
    case "per-env":
    case "env-samples": {
      const outDir = flagString(args, "out-dir") ?? flagString(args, "out");
      if (!outDir) {
        console.error(
          "[node-settings] generate envs requires --out-dir <dir>",
        );
        return 2;
      }
      const examples = generatePerEnvExamples(loader);
      mkdirSync(outDir, { recursive: true });
      const written: string[] = [];
      for (const [envName, contents] of Object.entries(examples)) {
        const filename = `.env.${envName}.example`;
        const fullPath = resolve(outDir, filename);
        writeFileSync(fullPath, contents, "utf8");
        written.push(fullPath);
      }
      console.error(`wrote ${written.length} file(s):`);
      for (const p of written) console.error(`  ${p}`);
      return 0;
    }
    case "docs":
    case "markdown":
    case "md": {
      const title = flagString(args, "title");
      const intro = flagString(args, "intro");
      output = generateMarkdownDocs(loader.envFields, {
        ...(title !== undefined ? { title } : {}),
        ...(intro !== undefined ? { intro } : {}),
      });
      break;
    }
    case "json-schema":
    case "schema": {
      const title = flagString(args, "title");
      const $id = flagString(args, "id");
      const description = flagString(args, "description");
      output = generateJsonSchema(loader.envFields, {
        ...(title !== undefined ? { title } : {}),
        ...($id !== undefined ? { $id } : {}),
        ...(description !== undefined ? { description } : {}),
      });
      break;
    }
    case "k8s":
    case "kubernetes": {
      const name = flagString(args, "name");
      if (!name) {
        console.error(
          "[node-settings] generate k8s requires --name <app-name>",
        );
        return 2;
      }
      const namespace = flagString(args, "namespace");
      const inlineSecretValues = flagBool(args, "inline-secrets", false);
      const result = generateK8sManifests(loader.envFields, {
        name,
        ...(namespace !== undefined ? { namespace } : {}),
        inlineSecretValues,
      });
      output = result.yaml;
      break;
    }
    default: {
      console.error(
        `[node-settings] unknown generate target '${target}'. Targets: env-example, envs, docs, k8s, json-schema`,
      );
      return 2;
    }
  }

  if (outPath) {
    writeFileSync(outPath, output, "utf8");
    console.error(`wrote ${outPath}`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}
