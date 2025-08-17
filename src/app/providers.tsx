"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { useEffect } from 'react';
import { useStore } from '@/stores/rootStore';
import { ToastProvider, ToastBridge } from '@/components/ui/toast';

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
      <ToastProvider>
        <StoreInitializer />
        <ToastBridge />
        {children}
      </ToastProvider>
    </NextThemesProvider>
  );
}
