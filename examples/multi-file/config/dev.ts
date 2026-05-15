import type { DeepPartial } from "../../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const dev: DeepPartial<AppConfig> = {
  bucket: "dev-bucket",
  featureFlags: { experimentalSearch: true }, // test new search on dev only
};
