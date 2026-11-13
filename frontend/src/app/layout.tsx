import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: { default: "Customer Churn Intelligence Platform", template: "%s · Churn Intelligence" },
  description: "Predict customer churn with a trained machine-learning model, review risk, and track history.",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#07090e" }, { media: "(prefers-color-scheme: light)", color: "#f6f8fb" }] };

// Runs before paint so the saved theme never flashes the wrong colours.
const themeScript = `try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
