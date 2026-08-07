import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";
import "@/components/admin/editorial-admin.css";
import "@/components/news/homepage.css";
import "@/components/news/article-page.css";

export const metadata: Metadata = {
  title: "PressReady — AI News Draft Review",
  description: "Review news drafts and create publication-quality reports with your selected AI model.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant-HK">
      <body>{children}</body>
    </html>
  );
}
