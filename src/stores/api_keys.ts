import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Get the base path from environment variable
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

interface ApiKeysState {
  apiKeys: Record<string, string>;
  hasLoadedFromServer: boolean;
  setApiKeys: (keys: Record<string, string>) => void;
  loadApiKeysFromServer: () => Promise<void>;
  saveApiKeysToServer: () => Promise<void>;
}

const useApiKeys = create<ApiKeysState>()(
  persist(
    (set, get) => ({
      apiKeys: {},
      hasLoadedFromServer: false,

      setApiKeys: (keys: Record<string, string>) => {
        set({ apiKeys: keys });
        get().saveApiKeysToServer();
      },

      loadApiKeysFromServer: async () => {
        try {
          const response = await fetch(`${BASE_PATH}/api/keys`);
          if (!response.ok) throw new Error('Failed to load API keys');
          const data = await response.json();
          if (data.keys) {
            set({ apiKeys: data.keys, hasLoadedFromServer: true });
          }
        } catch (error) {
          console.error('Failed to load API keys:', error);
        }
      },

      saveApiKeysToServer: async () => {
        try {
          const { apiKeys } = get();
          const response = await fetch(`${BASE_PATH}/api/keys`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keys: apiKeys }),
          });
          if (!response.ok) throw new Error('Failed to save API keys');
        } catch (error) {
          console.error('Failed to save API keys:', error);
        }
      },
    }),
    {
      name: 'kibitz-api-keys',
      partialize: (state) => ({
        apiKeys: state.apiKeys,
      }),
    }
  )
);

export default useApiKeys;