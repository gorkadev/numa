import type { SectionId } from "@/lib/settings/sections"

/**
 * Every setting the dialog's search box can find, by message key so it
 * searches in the reader's language. `id` is the `settingId` of the row or
 * group a result scrolls to; `lib/settings/search.test.ts` fails when one no
 * longer exists or a key is missing in a language.
 */
export type SettingsSearchEntry = {
  id: string
  section: SectionId
  title: string
  description?: string
  keywords?: string
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = [
  {
    id: "theme",
    section: "general",
    title: "Settings.theme",
    description: "Settings.themeDescription",
    keywords: "Settings.searchKeywords.theme",
  },
  {
    id: "language",
    section: "general",
    title: "Settings.language",
    description: "Settings.languageDescription",
    keywords: "Settings.searchKeywords.language",
  },
  {
    id: "default-tier",
    section: "game",
    title: "Settings.game.defaultTier",
    description: "Settings.game.defaultTierDescription",
    keywords: "Settings.searchKeywords.defaultTier",
  },
  {
    id: "session-stats",
    section: "game",
    title: "Settings.game.sessionStats",
    description: "Settings.game.sessionStatsDescription",
  },
  {
    id: "wrap-code",
    section: "game",
    title: "Settings.game.wrapCode",
    description: "Settings.game.wrapCodeDescription",
  },
  {
    id: "improver-overage",
    section: "game",
    title: "Settings.game.improverOverage",
    description: "Settings.game.improverOverageDescription",
    keywords: "Settings.searchKeywords.improver",
  },
  {
    id: "profile-picture",
    section: "account",
    title: "Settings.profilePicture",
    keywords: "Settings.searchKeywords.profilePicture",
  },
  { id: "full-name", section: "account", title: "Settings.fullName" },
  { id: "email", section: "account", title: "Settings.email" },
  {
    id: "connected-accounts",
    section: "account",
    title: "Settings.connectedAccounts",
    description: "Settings.connectedAccountsDescription",
    keywords: "Settings.searchKeywords.connectedAccounts",
  },
  {
    id: "sign-out",
    section: "account",
    title: "Settings.signOut",
    description: "Settings.endSessionOnDevice",
    keywords: "Settings.searchKeywords.signOut",
  },
  {
    id: "two-factor",
    section: "security",
    title: "Settings.twoFactor",
    description: "Settings.twoFactorDescription",
    keywords: "Settings.searchKeywords.twoFactor",
  },
  {
    id: "passkeys",
    section: "security",
    title: "Settings.passkeys",
    description: "Settings.passkeysDescription",
    keywords: "Settings.searchKeywords.passkeys",
  },
  {
    id: "sessions",
    section: "security",
    title: "Settings.sessions",
    description: "Settings.sessionsDescription",
    keywords: "Settings.searchKeywords.sessions",
  },
  {
    id: "shortcuts",
    section: "shortcuts",
    title: "Settings.shortcutsTab",
    keywords: "Settings.searchKeywords.shortcuts",
  },
  {
    id: "current-plan",
    section: "billing",
    title: "Billing.currentPlan",
    keywords: "Settings.searchKeywords.plan",
  },
  {
    id: "credits",
    section: "billing",
    title: "Billing.credits",
    description: "Billing.creditsDescription",
  },
  {
    id: "manage-plan",
    section: "billing",
    title: "Billing.managePlan",
    description: "Billing.managePlanDescription",
    keywords: "Settings.searchKeywords.managePlan",
  },
  {
    id: "billing-portal",
    section: "billing",
    title: "Billing.billingPortal",
    description: "Billing.billingPortalDescription",
    keywords: "Settings.searchKeywords.billingPortal",
  },
  {
    id: "cancel-subscription",
    section: "billing",
    title: "Billing.cancelSubscription",
    description: "Billing.cancelSubscriptionDescription",
    keywords: "Settings.searchKeywords.cancelSubscription",
  },
  {
    id: "billing-history",
    section: "billing",
    title: "Billing.historyTitle",
    description: "Billing.historyDescription",
    keywords: "Settings.searchKeywords.history",
  },
]

export function isSettingId(value: string | null): value is string {
  return SETTINGS_SEARCH_INDEX.some((entry) => entry.id === value)
}
