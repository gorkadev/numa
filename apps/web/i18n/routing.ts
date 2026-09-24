import { defineRouting } from "next-intl/routing"

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE"

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "never",
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
})
