import { notFound } from "next/navigation"

/**
 * Every URL no other route matches. The root layout is `[locale]/layout.tsx`,
 * so without this an unknown path would get Next.js's own unstyled 404 rather
 * than `[locale]/not-found.tsx`. Static routes always win over a catch-all.
 */
export default function CatchAll() {
  notFound()
}
