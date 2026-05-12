import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "$GRINDR Generator",
  description: "Lore-consistent image prompt engine for $GRINDR Industries."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
