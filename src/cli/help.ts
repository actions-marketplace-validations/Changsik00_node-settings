export const HELP_TEXT = `node-settings — schema-first settings for Node apps

USAGE
  node-settings <command> [options]

COMMANDS
  validate [env-file]    Validate the env (or a .env file) against the schema.
  check                  Scan every per-env branch for placeholders and
                         missing required envs. Exits non-zero on errors.
  inspect [--env <name>] Show the env schema + layered config for each
                         perEnv branch (dry-run, no secrets required).
  preflight [env-file]   One-shot CI gate: validate + check + inspect.
  diff [file|-]          Compare a live K8s ConfigMap/Secret YAML
                         against the schema; flag drift + leaked secrets.
  generate <target>      Generate artifacts from the schema.
                         Targets: env-example | envs | docs | k8s |
                                  json-schema | tfvars | compose

GLOBAL OPTIONS
  --config <path>        Path to the settings config file.
                         Default: auto-discover node-settings.config.{ts,js,...}
  --format <text|json>   Output format for validate / check / inspect / preflight.
                         Default: text. json emits a single document on stdout.
  --workspace            For check / inspect / preflight: iterate every
                         package under packages/, apps/, services/, libs/.

validate
  node-settings validate [env-file] [--config <path>] [--format <text|json>]
    Loads the env file (or process.env) and runs the schema.

check
  node-settings check [--env <a,b,c>] [--env-file name=path,name=path]
                      [--allow-warnings | --no-allow-warnings]
                      [--workspace] [--format <text|json>]
    Reports placeholder values, empty required strings, missing
    required env vars, unfilled todo() sentinels, and secret-looking
    keys placed in perEnv (where operator env vars cannot reach them).

inspect
  node-settings inspect [--env <a,b,c>] [--config <path>]
                        [--workspace] [--format <text|json>]
    Prints the env schema and the layered config (defaults + perEnv[mode])
    for each branch. Does not call the loader — no env values required.

preflight
  node-settings preflight [env-file] [--env <a,b,c>]
                          [--env-file name=path,name=path]
                          [--workspace] [--format <text|json>]
    Composite CI gate. Runs validate against the live env (or supplied
    file), then check, then inspect. Exits non-zero if any stage fails.

diff
  node-settings diff [file|-] [--config <path>] [--strict]
                     [--format <text|json>]
    Compare a live K8s manifest (ConfigMap + Secret YAML) against
    the schema. Reports missing required keys, secrets accidentally
    placed in a ConfigMap, non-secrets in a Secret, and extra
    undeclared keys. Pipe input via "kubectl get cm,secret -o yaml".
    --strict treats warnings (extra-key, public-in-secret) as errors.

generate env-example   [--out <path>]
generate envs          --out-dir <dir>
                       Writes one .env.<branch>.example per perEnv branch
                       (e.g. .env.local.example, .env.dev.example, .env.prod.example).
generate docs          [--out <path>] [--title <s>] [--intro <s>]
generate k8s --name <app> [--namespace <ns>] [--inline-secrets] [--out <path>]
generate json-schema   [--out <path>] [--title <s>] [--id <url>] [--description <s>]
generate tfvars        [--out <path>]
                       Writes a Terraform .tfvars file. Required values use
                       REPLACE_ME placeholders; pass via TF_VAR_* env vars.
generate compose       [--name <service>] [--style service|env-file] [--out <path>]
                       Writes a Docker Compose snippet. Default 'service'
                       style yields a complete services: block; 'env-file'
                       yields a .env-style file for env_file: references.

EXAMPLES
  node-settings validate .env.production
  node-settings check --env prod,stage --env-file prod=.env.prod
  node-settings preflight .env.production --format json
  kubectl get cm,secret -n prod -o yaml | node-settings diff -
  node-settings generate env-example --out .env.example
  node-settings generate envs --out-dir env-samples/
  node-settings generate docs --out ENV.md
  node-settings generate k8s --name my-app --namespace prod --out k8s.yaml
  node-settings generate tfvars --out terraform.tfvars
  node-settings generate compose --name web --out docker-compose.snippet.yml
`;
