import { redirect } from "next/navigation"

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * There is no separate sign-up flow: every provider in `lib/auth.ts` is a
 * social provider, and `signIn.social` creates the account on first use the
 * same way it signs an existing user back in. `/sign-in`'s two buttons are
 * therefore already "sign up" for anyone who has not been here before, so
 * this route just sends visitors there instead of duplicating that page.
 */
export default function SignUpPage() {
  redirect("/sign-in")
}
