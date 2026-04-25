import type { Metadata } from "next";
import { Lora, Nunito } from "next/font/google";

import "./globals.css";
import "./branding.css";

const bodyFont = Nunito({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Lora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "PsicoApp",
  description: "Painel clinico com pacientes, sessoes e agenda integrado ao Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
