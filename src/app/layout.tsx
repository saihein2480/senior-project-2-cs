import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "../components/NavBar";
import { LanguageProvider } from "../contexts/LanguageContext";
import Footer from "../components/Footer";
import InstallPrompt from "../components/InstallPrompt";
import ServiceWorkerRegistration from "../components/ServiceWorkerRegistration";
import QueryProvider from "../providers/QueryProvider";
import { CustomerAuthProvider } from "../contexts/CustomerAuthContext";
import { CartProvider } from "../contexts/CartContext";

export const dynamic = 'force-dynamic';
import ChatBot from "../components/ChatBot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Swe Trendy Hub",
  description: "Swe Trendy Hub - Online clothing store",
  icons: {
    icon: "/icon-192x192.png",
    shortcut: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Swe Trendy Hub",
  },
  applicationName: "Swe Trendy Hub",
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/logo.jpg" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
        style={{ backgroundColor: "#ffffff", color: "#111827" }}
      >
        <QueryProvider>
          <LanguageProvider>
            <CustomerAuthProvider>
              <CartProvider>
                <ServiceWorkerRegistration />
                <NavBar />
                <main className="flex-1">{children}</main>
                <Footer />
                <InstallPrompt />
                <ChatBot />
              </CartProvider>
            </CustomerAuthProvider>
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
