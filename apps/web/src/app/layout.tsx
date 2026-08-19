import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { AuthProvider } from "@/components/auth/auth-provider";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Automatize It",
  description: "Plataforma de seguimiento post-venta y fidelización de clientes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}