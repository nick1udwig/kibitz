export function getEnvironmentApiKey(): string {
  const key = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '';
  console.log('Loading Anthropic key from env:', key ? 'Found key' : 'No key found');
  return key;
}