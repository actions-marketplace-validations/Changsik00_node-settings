import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";
import { todo } from "../../src/index.js";

/**
 * NOTE: `sentryDsn` is intentionally left as a `todo(...)` sentinel to
 * demonstrate how the loader fails fast for incomplete environments:
 *
 *   $ node-settings inspect --config sample/settings.ts --env=prod
 *     -> shows  sentryDsn: <TODO: "...">
 *   $ node-settings check --config sample/settings.ts
 *     -> reports kind:'todo' error for perEnv.prod.sentryDsn
 *   loader({ APP_ENV: "prod", ... })
 *     -> throws NodeSettingsError(PER_ENV_TODO)
 *
 * Real projects: replace this with the actual DSN before deploying.
 */
export const prod: DeepPartial<AppConfig> = {
  bucket: "prod-bucket",
  region: "us-east-1",
  sentryDsn: todo("provide prod Sentry DSN before first deploy"),
  workerConcurrency: 8,
  featureFlags: { newCheckout: true },
  rateLimits: { perUserRequestsPerMinute: 120 },
};
