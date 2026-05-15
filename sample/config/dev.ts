import type { DeepPartial } from "../../src/utils/deep-merge.js";
import type { AppConfig } from "./defaults.js";

export const dev: DeepPartial<AppConfig> = {
  bucket: "dev-bucket",
  region: "us-east-1",
  sentryDsn: "https://dev-key@o00000.ingest.sentry.io/0000000",
  featureFlags: { experimentalSearch: true },
};
