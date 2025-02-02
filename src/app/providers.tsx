"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";
import { useEffect } from "react";
import { useStore } from "@/stores/rootStore";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider, http, createConfig } from "wagmi";
import { optimism } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Buffer } from "buffer";
import "@rainbow-me/rainbowkit/styles.css";

const StoreInitializer = () => {
  const initialize = useStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return null;
};

export const config = createConfig({
  chains: [optimism],
  transports: {
    [optimism.id]: http(),
  },
});

// Initialize Buffer globally if needed
if (typeof window !== "undefined") {
  globalThis.Buffer = Buffer;
}

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

const queryClient = new QueryClient();

export function Providers({ children, ...props }: ThemeProviderProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider showRecentTransactions={true}>
          <NextThemesProvider {...props}>
            <StoreInitializer />
            {children}
          </NextThemesProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
