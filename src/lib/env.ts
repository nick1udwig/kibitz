export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable in production: ${name}`);
    }
    console.warn(`Missing environment variable: ${name}, using development fallback`);
    return 'dev_fallback';
  }
  return value;
}

export function getAnthropicKey(): string {
  const key = getRequiredEnvVar('ANTHROPIC_API_KEY');
  if (process.env.NODE_ENV === 'production') {
    console.log('Anthropic API key configured:', key ? 'Yes' : 'No');
  }
  return key;
}

export function getAppPassword(): string {
  const password = process.env.NEXT_PUBLIC_APP_PASSWORD;
  console.log('Environment mode:', process.env.NODE_ENV);
  console.log('App password configured:', password ? 'Yes' : 'No');
  
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_APP_PASSWORD must be set in production');
    }
    console.warn('No password set in NEXT_PUBLIC_APP_PASSWORD, using development fallback');
    return 'kibitz123'; // fallback for development only
  }
  return password;
}