import { Polar } from "@polar-sh/sdk"

/**
 * The one Polar client this application talks through.
 *
 * The environment is read from `POLAR_SERVER` and is never hardcoded, because
 * sandbox and production are not two modes of one account — they are two
 * entirely separate Polar organizations, with their own access tokens, their
 * own webhook secrets and their own product ids. A literal `"sandbox"` in this
 * file would therefore be a value that can silently disagree with the token
 * sitting immediately next to it, and the failure that produces is not a clean
 * one: the token authenticates against an organization whose products the
 * hardcoded server has never heard of. Moving this integration to production
 * must be an env change, never a code change.
 *
 * The fallback is `"sandbox"` and deliberately not `"production"`. An unset
 * variable is a misconfiguration either way; the only question is which way a
 * misconfigured payment integration should fail, and the answer is against test
 * money rather than real money.
 *
 * That default has to be revisited at launch. Its cost is the mirror image of
 * its benefit: with it in place, forgetting `POLAR_SERVER` in production does
 * not crash — it quietly routes real customers into sandbox, where their
 * payments are not payments at all. Before this integration takes real money,
 * this should become an explicit read that refuses to start without the
 * variable.
 *
 * A missing `POLAR_ACCESS_TOKEN` is intentionally not guarded here. The SDK
 * call fails with Polar's own authentication error, which names the request it
 * was making and what the API said about it — strictly more than a hand-written
 * throw at import time could say.
 */
export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
})
