export function getEnvironmentApiKey(): string {
  return process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '';
}