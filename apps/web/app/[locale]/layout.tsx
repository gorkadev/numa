import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations } from "next-intl/server"

import "@workspace/ui/globals.css"
import "blobatar/motion.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"
import { LocalizedToaster } from "@/components/localized-toaster"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { routing } from "@/i18n/routing"
import { LocaleReconciler } from "@/components/locale-reconciler"
import { fontMono, inter } from "@/lib/fonts"

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata")

  return {
    title: {
      default: "Numa",
      template: "%s | Numa",
    },
    description: t("description"),
    icons: {
      icon: [
        { url: "/logo.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/icons/apple-icon.png",
    },
  }
}

export const viewport: Viewport = {
  themeColor: "#2563eb",
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

  const messages = await getMessages()

  return (
    <html
      lang={locale}
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocaleReconciler locale={locale} />
          <LocalizedToaster>
            {/**
             * A short wait before any tooltip opens, so passing the pointer
             * over a control (a message's time, an action icon) does not flash
             * its tooltip. Once one is open, its neighbours open at once.
             */}
            <TooltipProvider delay={300}>
              <ThemeProvider>{children}</ThemeProvider>
            </TooltipProvider>
          </LocalizedToaster>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
