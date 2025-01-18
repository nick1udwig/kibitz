"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useMcpStore } from '@/stores/mcpStore';

const StoreInitializer = () => {
  const initializeProject = useProjectStore(state => state.initialize);
  const initializeMcp = useMcpStore(state => state.initialize);

  useEffect(() => {
    initializeProject();
    initializeMcp();
  }, [initializeProject, initializeMcp]);

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
