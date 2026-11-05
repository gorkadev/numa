import { Suspense } from "react"

import { AuthPage } from "@/components/auth-page"

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

/**
 * Better Auth redirects a failed OAuth round trip back here with
 * `?error=<code>` — see `onAPIError.errorURL` in `lib/auth.ts`. Reading it
 * from `searchParams` keeps this a Server Component and spares `AuthPage` a
 * `useSearchParams` Suspense boundary.
 *
 * The page itself does not depend on the query string, so it prerenders as
 * the shell and the error, when there is one, replaces it as the read resolves.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  return (
    <Suspense fallback={<AuthPage />}>
      <SignInWithError searchParams={searchParams} />
    </Suspense>
  )
}

async function SignInWithError({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { error } = await searchParams

  return <AuthPage error={typeof error === "string" ? error : undefined} />
}
