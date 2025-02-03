export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAppPassword(): string {
  const password = process.env.NEXT_PUBLIC_APP_PASSWORD;
  if (!password) {
    console.warn('No password set in NEXT_PUBLIC_APP_PASSWORD');
    return 'kibitz123'; // fallback for development
  }
  return password;
}