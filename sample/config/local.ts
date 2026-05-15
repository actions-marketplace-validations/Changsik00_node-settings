import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const local: DeepPartial<AppConfig> = {
  bucket: "local-bucket",
  logLevel: "debug",
  rateLimits: { perUserRequestsPerMinute: 1000 }, // no throttling locally
};
