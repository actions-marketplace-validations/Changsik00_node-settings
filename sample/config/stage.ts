import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const stage: DeepPartial<AppConfig> = {
  bucket: "stage-bucket",
  region: "us-east-1",
  sentryDsn: "https://stage-key@o00000.ingest.sentry.io/1111111",
  workerConcurrency: 4,
};
