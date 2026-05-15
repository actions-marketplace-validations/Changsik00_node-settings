/**
 * Baseline config — values that are correct for every environment
 * unless overridden in a per-env file (./local.ts, ./dev.ts, ...).
 *
 * This file is for *commit-time* values. Values that arrive at deploy
 * time (CI-injected secrets, runtime credentials) belong in
 * `envSchema` over in `settings.ts`, not here. See
 * `docs/CONFIGURATION.md` for the full pattern table.
 *
 * `todo(...)` is the commit-time placeholder: it forces every per-env
 * branch to supply a real value before that branch can boot.
 */
import { todo } from "../../src/index.js";

export interface AppConfig {
  bucket: string;
  region: string;
  cdnDomain: string;
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
  cdnDomain: todo("each per-env branch must set its CDN domain"),
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
