import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"
import { Toaster } from "@workspace/ui/components/toast"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "Numa",
    template: "%s | Numa",
  },
  description:
    "Build your own racers, shooters, puzzles and whole worlds using your own words. If you can describe it, you can play it.",
  icons: {
    icon: "/logo.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        {/**
         * `Toaster` mounts the toast provider, portal and viewport once for
         * the whole application. It has to sit above every page rather than
         * inside the one screen that raises a toast today: the manager it
         * renders is the module-level `toast` singleton from the UI package,
         * and `toast.add()` from anywhere only reaches a viewport that is
         * already on screen. Here it also survives navigation, so a toast
         * raised just before a redirect is still readable after it.
         */}
        <Toaster>
          <TooltipProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </TooltipProvider>
        </Toaster>
      </body>
    </html>
  )
}
