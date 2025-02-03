let environmentApiKey: string | null = null;

export async function initializeConfig() {
  try {
    const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const response = await fetch(`${BASE_PATH}/api/config`);
    if (response.ok) {
      const config = await response.json();
      environmentApiKey = config.anthropicKey;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

export function getEnvironmentApiKey(): string {
  return environmentApiKey || '';
}