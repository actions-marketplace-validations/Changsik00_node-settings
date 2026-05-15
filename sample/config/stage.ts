import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const stage: DeepPartial<AppConfig> = {
  bucket: "stage-bucket",
  region: "us-east-1",
  cdnDomain: "cdn.stage.example.com",
  workerConcurrency: 4,
};
