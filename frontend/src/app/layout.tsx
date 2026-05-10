import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@xyflow/react/dist/style.css";
import { NavHeader } from "@/components/NavHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OrchestAI",
    template: "%s · OrchestAI",
  },
  description:
    "Visual multi-agent workflow builder. Compose AI agents into pipelines, watch them think live, replay past runs.",
  applicationName: "OrchestAI",
  openGraph: {
    title: "OrchestAI",
    description: "Visual multi-agent workflow builder.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <NavHeader />
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
