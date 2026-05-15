import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const prod: DeepPartial<AppConfig> = {
  bucket: "prod-bucket",
  workerConcurrency: 8,
  featureFlags: { newCheckout: true },
  rateLimits: { perUserRequestsPerMinute: 120 },
};
