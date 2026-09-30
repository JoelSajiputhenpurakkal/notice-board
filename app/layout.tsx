import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NoticeBoard — Keep everyone in the loop",
  description: "A calm, accountable home for community notices."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
