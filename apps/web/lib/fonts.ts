import { Geist_Mono, Inter } from "next/font/google"

/**
 * The app's typefaces, shared by the root layout and `app/global-error.tsx`,
 * which replaces that layout when it fails and has to load them itself.
 */
export const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})
