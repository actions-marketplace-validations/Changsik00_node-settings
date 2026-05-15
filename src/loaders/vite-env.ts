/**
 * Vite (browser) env loader — placeholder for frontend integration.
 *
 * Vite policy reminder:
 *   - Only `VITE_`-prefixed variables are exposed to the client.
 *   - `import.meta.env` should be accessed only from this helper.
 *
 * Activate by replacing the body with the snippet below in a project
 * that ships Vite:
 *
 * ```ts
 * export function loadViteEnv(): Record<string, string | undefined> {
 *   return import.meta.env as Record<string, string | undefined>;
 * }
 * ```
 */
export function loadViteEnv(): Record<string, string | undefined> {
  return {};
}
