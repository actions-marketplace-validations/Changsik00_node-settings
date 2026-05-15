import { writeFileSync } from "node:fs";
import { generateEnvExample } from "../generators/env-example.js";
import { generateMarkdownDocs } from "../generators/markdown.js";
import { generateK8sManifests } from "../generators/k8s.js";
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
      "[node-settings] generate <target> required. Targets: env-example, docs, k8s",
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
        `[node-settings] unknown generate target '${target}'. Targets: env-example, docs, k8s`,
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
