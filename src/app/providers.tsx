"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { useEffect } from 'react';
import { useStore } from '@/stores/rootStore';
import { githubSyncService } from '@/lib/githubSyncService';

const StoreInitializer = () => {
  const initialize = useStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

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
