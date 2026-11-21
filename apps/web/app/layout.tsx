import type { Metadata, Viewport } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: { default: "PrivaOps — Privacy Operations", template: "%s | PrivaOps" },
  description: "A multi-tenant privacy operations workspace for data inventory, processing transparency, privacy request coordination, and operational audit history.",
  applicationName: "PrivaOps",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#102a20", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
