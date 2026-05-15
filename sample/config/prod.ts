import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";
import { todo } from "../../src/index.js";

/**
 * NOTE: `cdnDomain` is intentionally left as a `todo(...)` sentinel
 * to demonstrate how the loader fails fast for incomplete envs:
 *
 *   $ node-settings inspect --config sample/settings.ts --env=prod
 *     -> shows  cdnDomain: <TODO: "...">
 *   $ node-settings check --config sample/settings.ts
 *     -> reports kind:'todo' error for perEnv.prod.cdnDomain
 *   loader({ APP_ENV: "prod", ... })
 *     -> throws NodeSettingsError(PER_ENV_TODO)
 *
 * Real projects: replace with the actual prod CDN domain before deploy.
 *
 * IMPORTANT — `todo(...)` is *only* for values committed to source.
 * If a value arrives at deploy time (CI-injected secrets, vault-pulled
 * credentials, ...), put it in `envSchema` over in `settings.ts`
 * instead, and let `ENV_VALIDATION_FAILED` enforce that CI set it.
 * See docs/CONFIGURATION.md "Which pattern for which value?".
 */
export const prod: DeepPartial<AppConfig> = {
  bucket: "prod-bucket",
  region: "us-east-1",
  cdnDomain: todo("set the prod CDN domain before first deploy"),
  workerConcurrency: 8,
  featureFlags: { newCheckout: true },
  rateLimits: { perUserRequestsPerMinute: 120 },
};
