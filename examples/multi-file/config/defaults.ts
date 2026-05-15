/**
 * Baseline config — values that are correct for *every* environment
 * unless explicitly overridden in a per-env file.
 *
 * Keep this small: only put genuinely shared values here. Per-env files
 * (./local.ts, ./prod.ts, etc.) override anything that varies.
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
  bucket: "", // every env must supply this
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
