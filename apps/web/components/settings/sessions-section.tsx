"use client"

import { useEffect, useState } from "react"
import {
  ComputerIcon,
  GlobalIcon,
  SmartPhone01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@workspace/ui/components/button"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { authClient } from "@/lib/auth-client"
import {
  describeUserAgent,
  deviceKind,
  type DeviceKind,
} from "@/lib/format/user-agent"
import {
  SettingsGroup,
  SettingsRow,
  SettingsRows,
} from "@/components/settings/settings-group"

/**
 * One row from `authClient.listSessions()` — the client-side counterpart of
 * `packages/db/src/schema.ts`'s `session` table, with its `Date` columns
 * serialized to strings over the wire.
 */
type SessionListItem = NonNullable<
  Awaited<ReturnType<typeof authClient.listSessions>>["data"]
>[number]

const DEVICE_ICONS: Record<DeviceKind, typeof ComputerIcon> = {
  mobile: SmartPhone01Icon,
  tablet: Tablet01Icon,
  desktop: ComputerIcon,
  unknown: GlobalIcon,
}

function DeviceIcon({ userAgent }: { userAgent: string | null | undefined }) {
  return (
    <ItemMedia className="size-8 rounded-lg bg-background text-muted-foreground">
      <HugeiconsIcon
        icon={DEVICE_ICONS[deviceKind(userAgent)]}
        className="size-4"
        strokeWidth={2}
      />
    </ItemMedia>
  )
}

/**
 * A session's IP, or `null` when it carries no information worth a line.
 *
 * In development every session comes from the machine running the browser,
 * so the column is a loopback address — and Node normalizes `::1` into its
 * fully expanded form, which renders as a 39-character run of zeroes that
 * pushes the useful half of the row off screen. Nothing about "this request
 * came from here" helps someone recognize a device, so it is dropped rather
 * than shortened.
 */
function displayIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return null

  /**
   * `127.0.0.0/8` on the v4 side; on the v6 side every zero-padded spelling
   * of `::1` and of the unspecified address `::`, which are nothing but
   * zeroes, colons and an optional trailing one.
   */
  const local =
    /^127\./.test(ipAddress) ||
    (ipAddress.includes(":") && /^[0:]*1?$/.test(ipAddress))

  return local ? null : ipAddress
}

/**
 * How long ago a session was last used.
 *
 * `updatedAt` is the column Better Auth touches on every session refresh, so
 * it is the closest thing to "last seen" the schema has. Prose here, unlike
 * the absolute timestamp this replaced: on this list the question is never
 * "when exactly" but "is this one stale", and "3 days ago" answers that at a
 * glance where "15/09/2026, 21:04:18" makes the reader do the subtraction.
 */
function lastSeen(updatedAt: string | Date) {
  return formatDistanceToNow(new Date(updatedAt), { addSuffix: true })
}

/**
 * The account's active sessions: the one being used right now, then every
 * other one under a single revoke-all header.
 *
 * # Why the current session is its own card
 *
 * It is the one row that can never be acted on — you cannot sign yourself
 * out from a list whose purpose is signing *other* devices out — and it is
 * the reference point for reading the rest ("that one is me, so what is
 * that other one?"). Mixing it into the list means every row carries a
 * "(this device)" caveat and a conditionally-missing button, which is the
 * shape the previous version had. Splitting it puts the exception in its own
 * box and leaves the list below uniform: every row there has the same
 * affordance.
 */
export function SessionsSection() {
  const { data: session } = authClient.useSession()

  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [revokingToken, setRevokingToken] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  async function loadSessions() {
    const { data } = await authClient.listSessions()
    setSessions(data ?? [])
  }

  useEffect(() => {
    loadSessions().finally(() => setLoading(false))
  }, [])

  async function signOutSession(token: string) {
    setRevokingToken(token)
    await authClient.revokeSession({ token })
    await loadSessions()
    setRevokingToken(null)
  }

  async function signOutOtherSessions() {
    setRevokingOthers(true)
    await authClient.revokeOtherSessions()
    await loadSessions()
    setRevokingOthers(false)
  }

  if (!session) return null

  const currentSessionId = session.session.id
  /**
   * `listSessions` includes the current session, but the client session
   * object is the authority on the device's own user agent — so the current
   * row is rendered from the list entry when it is there and from the
   * session itself while the list is still loading.
   */
  const current =
    sessions.find((item) => item.id === currentSessionId) ?? session.session
  const others = sessions.filter((item) => item.id !== currentSessionId)

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup
        title="Sessions"
        description="Devices logged into your account"
      >
        <SettingsRow size="sm">
          <DeviceIcon userAgent={current.userAgent} />
          <ItemContent>
            <ItemTitle>{describeUserAgent(current.userAgent)}</ItemTitle>
            <ItemDescription className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-emerald-500">
                <span className="size-1.5 rounded-full bg-current" />
                Current session
              </span>
              {displayIp(current.ipAddress) && (
                <span>· {displayIp(current.ipAddress)}</span>
              )}
            </ItemDescription>
          </ItemContent>
        </SettingsRow>
      </SettingsGroup>

      {loading ? (
        <SettingsRows>
          <SettingsRow size="sm">
            <Skeleton className="size-8 rounded-lg" />
            <ItemContent className="gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </ItemContent>
          </SettingsRow>
        </SettingsRows>
      ) : (
        others.length > 0 && (
          <SettingsRows>
            <SettingsRow>
              <ItemContent>
                <ItemTitle>
                  {others.length === 1
                    ? "1 other session"
                    : `${others.length} other sessions`}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                <Button
                  variant="ghost"
                  disabled={revokingOthers}
                  onClick={signOutOtherSessions}
                >
                  {revokingOthers && <Spinner />}
                  Revoke all
                </Button>
              </ItemActions>
            </SettingsRow>

            {others.map((item) => (
              <SettingsRow
                key={item.id}
                className="transition-colors hover:bg-muted/60"
              >
                <DeviceIcon userAgent={item.userAgent} />
                <ItemContent>
                  <ItemTitle>{describeUserAgent(item.userAgent)}</ItemTitle>
                  <ItemDescription>
                    {displayIp(item.ipAddress)
                      ? `${displayIp(item.ipAddress)} · `
                      : ""}
                    Last seen {lastSeen(item.updatedAt)}
                  </ItemDescription>
                </ItemContent>
                {/**
                 * Per-row revoke stays out of the way until the pointer is on
                 * the row it belongs to — with one button per session the
                 * column reads as a wall of identical actions otherwise, and
                 * the header's "Revoke all" is the one that has to be visible
                 * at all times. `focus-within` keeps it reachable by keyboard,
                 * where there is no hover to trigger, and an in-flight revoke
                 * stays visible so its spinner does not vanish mid-request.
                 */}
                <ItemActions
                  className={cn(
                    "opacity-0 transition-opacity group-hover/item:opacity-100 focus-within:opacity-100",
                    revokingToken === item.token && "opacity-100"
                  )}
                >
                  <Button
                    variant="ghost"
                    disabled={revokingToken === item.token}
                    onClick={() => signOutSession(item.token)}
                  >
                    {revokingToken === item.token && <Spinner />}
                    Revoke
                  </Button>
                </ItemActions>
              </SettingsRow>
            ))}
          </SettingsRows>
        )
      )}
    </div>
  )
}
