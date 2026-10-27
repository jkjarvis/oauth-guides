import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Link from "next/link"
import { KeyRound } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "OAuth Guides", template: "%s · OAuth Guides" },
  description: "Set up and get approval for your own OAuth app with each provider: steps, time, blockers, and evidence.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen min-w-[1024px]">
        <TooltipProvider>
          <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-8">
              <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="grid size-6 place-items-center rounded-md bg-foreground text-background">
                  <KeyRound className="size-3.5" />
                </span>
                OAuth Guides
              </Link>
              <nav className="flex items-center gap-6 text-sm text-muted-foreground">
                <Link href="/" className="hover:text-foreground">Library</Link>
                <a href="https://docs.composio.dev/toolkits/managed-auth" target="_blank" rel="noreferrer" className="hover:text-foreground">
                  Composio managed auth ↗
                </a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-8 py-10">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  )
}
