import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Tailor",
  description:
    "Tailor your resume to a job description, review every change, and export an ATS-safe PDF or DOCX.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b bg-card">
          <nav className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              Resume&nbsp;Tailor
            </Link>
            <Link href="/" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/resume" className="text-muted-foreground hover:text-foreground">
              Master resume
            </Link>
            <Link
              href="/settings"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              AI models
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-[1400px] px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
