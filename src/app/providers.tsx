"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { useEffect } from 'react';
import { useStore } from '@/stores/rootStore';
import useApiKeys from '@/stores/api_keys';

const StoreInitializer = () => {
  const initialize = useStore(state => state.initialize);
  const { loadApiKeysFromServer, apiKeys, hasLoadedFromServer } = useApiKeys();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Load API keys from server if we haven't loaded them yet and there are no keys in IndexedDB
  useEffect(() => {
    if (!hasLoadedFromServer && Object.keys(apiKeys).length === 0) {
      loadApiKeysFromServer();
    }
  }, [loadApiKeysFromServer, hasLoadedFromServer, apiKeys]);

  return null;
};

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <StoreInitializer />
      {children}
    </NextThemesProvider>
  );
}
