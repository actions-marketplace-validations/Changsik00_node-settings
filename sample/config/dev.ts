import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const dev: DeepPartial<AppConfig> = {
  bucket: "dev-bucket",
  region: "us-east-1",
  cdnDomain: "cdn.dev.example.com",
  featureFlags: { experimentalSearch: true },
};
