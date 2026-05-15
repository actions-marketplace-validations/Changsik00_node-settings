import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const stage: DeepPartial<AppConfig> = {
  bucket: "stage-bucket",
  workerConcurrency: 4,
};
