import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ViewportHeightFix } from "@/components/viewport-height-fix";
import { Asap, Inter, Young_Serif } from "next/font/google";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const youngSerif = Young_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-young-serif",
  display: "swap",
});

const notesSans = Asap({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-notes-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nod Notes - AI Chat for Visual Mind Mapping",
  description: "Transform conversations into smart visual mind maps. Learn visually with AI-powered chat and interactive diagrams.",
  icons: {
    icon: "/favicon.svg?v=5",
  },
};

// Board has its own pinch-zoom — lock browser page zoom so iOS doesn’t auto-zoom on TipTap focus
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${youngSerif.variable} ${notesSans.variable}`} suppressHydrationWarning>
        <Script id="nn-board-font" strategy="beforeInteractive">{`
          (function () {
            try {
              var path = location.pathname.replace(/\\/+$/, '') || '/';
              var key = null;
              if (path === '/board') key = 'nodnotes-prefs-default';
              else {
                var m = path.match(/^\\/(?:board|view)\\/([^/]+)$/);
                if (m) key = 'nodnotes-prefs-' + decodeURIComponent(m[1]);
              }
              if (!key) return;
              var prefs = JSON.parse(localStorage.getItem(key) || '{}');
              var font = prefs.boardFont;
              if (font !== 'default' && font !== 'serif' && font !== 'mono') font = 'default';
              document.documentElement.setAttribute('data-nn-board-font', font);
            } catch (e) {}
          })();
        `}</Script>
        <ViewportHeightFix />
        <ThemeProvider>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

