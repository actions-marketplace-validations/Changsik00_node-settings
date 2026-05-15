/**
 * Baseline config — values that are correct for every environment
 * unless overridden in a per-env file (./local.ts, ./dev.ts, ...).
 *
 * Keep this small. Put genuinely shared values here only.
 */

export interface AppConfig {
  bucket: string;
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
