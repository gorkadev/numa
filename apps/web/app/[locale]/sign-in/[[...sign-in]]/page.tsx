import { AuthPage } from "@/components/auth-page"

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
