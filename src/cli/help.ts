export const HELP_TEXT = `node-settings — schema-first settings for Node apps

USAGE
  node-settings <command> [options]

COMMANDS
  validate [env-file]    Validate the env (or a .env file) against the schema.
  check                  Scan every per-env branch for placeholders and
                         missing required envs. Exits non-zero on errors.
  generate <target>      Generate artifacts from the schema.
                         Targets: env-example | envs | docs | k8s

GLOBAL OPTIONS
  --config <path>        Path to the settings config file.
                         Default: auto-discover node-settings.config.{ts,js,...}

validate
  node-settings validate [env-file] [--config <path>]
    Loads the env file (or process.env) and runs the schema.

check
  node-settings check [--env <a,b,c>] [--env-file name=path,name=path]
                      [--allow-warnings | --no-allow-warnings]
    Reports placeholder values, empty required strings, and missing
    required env vars per branch.

generate env-example   [--out <path>]
generate envs          --out-dir <dir>
                       Writes one .env.<branch>.example per perEnv branch
                       (e.g. .env.local.example, .env.dev.example, .env.prod.example).
generate docs          [--out <path>] [--title <s>] [--intro <s>]
generate k8s --name <app> [--namespace <ns>] [--inline-secrets] [--out <path>]

EXAMPLES
  node-settings validate .env.production
  node-settings check --env prod,stage --env-file prod=.env.prod
  node-settings generate env-example --out .env.example
  node-settings generate envs --out-dir env-samples/
  node-settings generate docs --out ENV.md
  node-settings generate k8s --name my-app --namespace prod --out k8s.yaml
`;
