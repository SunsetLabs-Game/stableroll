/** Shared env guard. Throws a named error so live tests fail loudly when a credential is missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
