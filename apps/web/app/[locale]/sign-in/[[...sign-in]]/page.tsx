import { AuthPage } from "@/components/auth-page"

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * Better Auth redirects a failed OAuth round trip back here with
 * `?error=<code>` — see `onAPIError.errorURL` in `lib/auth.ts`. Reading it
 * from `searchParams` keeps this a Server Component and spares `AuthPage` a
 * `useSearchParams` Suspense boundary.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { error } = await searchParams

  return <AuthPage error={typeof error === "string" ? error : undefined} />
}
