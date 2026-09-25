import type { Metadata } from "next";
import "./globals.css";
import "../src/presentation/voice-expense-recorder.css";
import "../src/presentation/responsive.css";

export const metadata: Metadata = {
  title: "Mi Balance · Obligaciones e ingresos",
  description: "Tus ingresos, obligaciones y pagos mensuales en un solo lugar.",
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
