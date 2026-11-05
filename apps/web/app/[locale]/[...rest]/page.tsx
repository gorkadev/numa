import { notFound } from "next/navigation"

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * Every URL no other route matches. The root layout is `[locale]/layout.tsx`,
 * so without this an unknown path would get Next.js's own unstyled 404 rather
 * than `[locale]/not-found.tsx`. Static routes always win over a catch-all.
 */
export default function CatchAll() {
  notFound()
}
