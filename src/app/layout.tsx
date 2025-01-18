import { Inter } from "next/font/google";
import { ThemeProvider } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'Kibitz',
  description: 'Chat with LLMs that use tools',
};

const PATH_PREFIX = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href={`${PATH_PREFIX}/favicon.svg`} type="image/svg" />
      </head>
      <body className={`${inter.className} bg-background min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
