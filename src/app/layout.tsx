import { Inter } from "next/font/google";
import { ThemeProvider } from "./providers";
import { McpProvider } from "@/components/LlmChat/context/McpContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-background min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <McpProvider>
            {children}
          </McpProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
