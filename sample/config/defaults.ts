/**
 * Baseline config — values that are correct for every environment
 * unless overridden in a per-env file (./local.ts, ./dev.ts, ...).
 *
 * Keep this small. Put genuinely shared values here only.
 *
 * Note the use of `todo(...)` for `region` and `sentryDsn`: this marks
 * fields as "every per-env branch MUST supply a real value". The
 * loader throws `NodeSettingsError(PER_ENV_TODO)` if any branch is
 * loaded without filling them in. Catches forgotten configuration at
 * boot instead of as a silent prod incident.
 */
import { todo } from "../../src/index.js";

export interface AppConfig {
  bucket: string;
  region: string;
  sentryDsn: string;
  workerConcurrency: number;
  logLevel: "debug" | "info" | "warn" | "error";
  featureFlags: {
    newCheckout: boolean;
    experimentalSearch: boolean;
  };
  rateLimits: {
    perUserRequestsPerMinute: number;
  };
}

export const defaults: AppConfig = {
  bucket: "", // every env supplies this
  region: todo("each per-env branch must set the deployment region"),
  sentryDsn: todo("each per-env branch must set its Sentry DSN"),
  workerConcurrency: 1,
  logLevel: "info",
  featureFlags: {
    newCheckout: false,
    experimentalSearch: false,
  },
  rateLimits: {
    perUserRequestsPerMinute: 60,
  },
};
