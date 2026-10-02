import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Library Finder · Mendeley Explorer",
  description: "Explora tus artículos, carpetas y todas sus ubicaciones en una sola biblioteca.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
