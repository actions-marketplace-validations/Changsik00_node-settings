/**
 * Node.js env loader — the *single* place where `process.env` is read.
 *
 * Treat this as the only sanctioned entry point for reading the raw
 * environment. Anywhere else that needs an env value should go through
 * the validated, frozen settings object produced by `defineSettings`.
 *
 * dotenv loading itself is the responsibility of the host application
 * (it should be done before `defineSettings(...)` is invoked). This
 * package does not import dotenv.
 */
export function loadNodeEnv(): Record<string, string | undefined> {
  return process.env;
}
