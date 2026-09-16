/**
 * A session's raw `User-Agent` string, reduced to the two facts a person
 * needs to recognize their own device: the browser and the operating system.
 *
 * # Why a hand-rolled parser rather than `ua-parser-js`
 *
 * The full libraries exist to answer questions this screen does not ask —
 * engine versions, device models, bot classification — and they carry a
 * regex table of several hundred entries to do it. Here the string is only
 * ever shown to the person who produced it, on a list whose whole job is
 * "is this me?", so being approximately right for the handful of mainstream
 * browsers and being honest ("Unknown device") for everything else is the
 * entire requirement.
 *
 * Order matters in both tables: every Chromium browser still claims to be
 * `Chrome`, and Chrome itself still claims to be `Safari`, so the more
 * specific brand has to be tested before the one it impersonates. Same on
 * the OS side — Android's UA contains `Linux`, and iPadOS's contains `Mac
 * OS X`.
 */
const BROWSERS: [pattern: RegExp, name: string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\//, "Opera"],
  [/\bBrave\//, "Brave"],
  [/\bArc\//, "Arc"],
  [/\bVivaldi\//, "Vivaldi"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
]

const PLATFORMS: [pattern: RegExp, name: string][] = [
  [/\bAndroid\b/, "Android"],
  [/\b(?:iPhone|iPod)\b/, "iOS"],
  [/\biPad\b/, "iPadOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
]

function match(table: [RegExp, string][], userAgent: string) {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1]
}

/**
 * The shape of device a session was created on, for choosing its icon.
 *
 * Deliberately coarser than the platform name: a row already SAYS "Chrome on
 * Android" in words, so the icon's only job is the silhouette — something
 * you hold, or something you sit at — and three buckets plus an honest
 * fallback cover that.
 */
export type DeviceKind = "mobile" | "tablet" | "desktop" | "unknown"

export function deviceKind(userAgent: string | null | undefined): DeviceKind {
  if (!userAgent) return "unknown"

  if (/\biPad\b|\bTablet\b/.test(userAgent)) return "tablet"
  if (/\bAndroid\b|\biPhone\b|\biPod\b|\bMobile\b/.test(userAgent)) {
    return "mobile"
  }
  if (match(PLATFORMS, userAgent)) return "desktop"

  return "unknown"
}

/**
 * Formats a user agent as `"<Browser> on <OS>"`, degrading to whichever half
 * is recognizable and to `"Unknown device"` when neither is.
 *
 * A null user agent is not an error: `session.userAgent` is nullable in the
 * schema, and a session created by a client that sent no header is still a
 * real session the user may want to revoke.
 */
export function describeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device"

  const browser = match(BROWSERS, userAgent)
  const platform = match(PLATFORMS, userAgent)

  if (browser && platform) return `${browser} on ${platform}`

  return browser ?? platform ?? "Unknown device"
}
