import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Series Zero",
  description: "Simulation. Fictional founders and funds. Not investment advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
