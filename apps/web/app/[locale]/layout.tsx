import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Geist_Mono, Inter } from "next/font/google"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTranslations } from "next-intl/server"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"
import { Toaster } from "@workspace/ui/components/toast"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { routing } from "@/i18n/routing"
import { LocaleReconciler } from "@/components/locale-reconciler"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata")

  return {
    title: {
      default: "Numa",
      template: "%s | Numa",
    },
    description: t("description"),
    icons: {
      icon: "/logo.svg",
    },
  }
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) notFound()

  // The rewritten route parameter can lag behind a cookie or account change.
  // Request config is the canonical precedence resolver for both providers.
  const resolvedLocale = await getLocale()
  if (!hasLocale(routing.locales, resolvedLocale)) notFound()

  const messages = await getMessages()

  return (
    <html
      lang={resolvedLocale}
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
        <NextIntlClientProvider locale={resolvedLocale} messages={messages}>
          <LocaleReconciler locale={resolvedLocale} />
          <Toaster>
            <TooltipProvider>
              <ThemeProvider>{children}</ThemeProvider>
            </TooltipProvider>
          </Toaster>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
