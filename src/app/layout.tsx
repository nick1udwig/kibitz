import { ThemeProvider } from "./providers";
import "./globals.css";

export const metadata = {
  title: 'Kibitz',
  description: 'Chat with LLMs that use tools',
};

const PATH_PREFIX = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// Expose the projects base dir to the client (optional UI-only needs)
// Note: Do NOT rely on this for server-side filesystem operations.
export const PROJECTS_BASE_DIR = process.env.NEXT_PUBLIC_PROJECTS_DIR;
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="icon" href={`${PATH_PREFIX}/favicon.svg`} type="image/svg" />
      </head>
      <body className={`bg-background min-h-screen`}>
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
