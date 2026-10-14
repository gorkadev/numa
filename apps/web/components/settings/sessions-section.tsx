"use client"

import { useEffect, useRef, useState } from "react"
import {
  ComputerIcon,
  GlobalIcon,
  SmartPhone01Icon,
  Tablet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useFormatter, useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toast"
import { cn } from "@workspace/ui/lib/utils"

import { Spinner } from "@/components/localized-spinner"

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

function displayIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return null
  return /^127\./.test(ipAddress) ||
    (ipAddress.includes(":") && /^[0:]*1?$/.test(ipAddress))
    ? null
    : ipAddress
}

function SessionsSkeleton() {
  const t = useTranslations("Settings")
  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup
        title={t("sessions")}
        description={t("sessionsDescription")}
      >
        <SettingsRow size="sm">
          <Skeleton className="size-8 rounded-lg" />
          <ItemContent className="gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </ItemContent>
        </SettingsRow>
      </SettingsGroup>
      <SettingsRows>
        <SettingsRow>
          <ItemContent className="gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-52" />
          </ItemContent>
          <Skeleton className="h-8 w-20" />
        </SettingsRow>
        <SettingsRow>
          <Skeleton className="size-8 rounded-lg" />
          <ItemContent className="gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </ItemContent>
        </SettingsRow>
      </SettingsRows>
    </div>
  )
}

export function SessionsSection() {
  const t = useTranslations("Settings")
  const format = useFormatter()
  const describeDevice = (userAgent: string | null | undefined) =>
    describeUserAgent(userAgent, {
      unknownDevice: t("unknownDevice"),
      formatBrowserPlatform: (browser, platform) =>
        t("browserOnPlatform", { browser, platform }),
    })
  const {
    data: session,
    error: sessionError,
    isPending: sessionPending,
    refetch: refetchSession,
  } = authClient.useSession()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)
  const mountedRef = useRef(true)
  const [revokingToken, setRevokingToken] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  async function loadSessions() {
    if (!mountedRef.current) return false

    const id = ++requestId.current
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await authClient.listSessions()
      if (!mountedRef.current || id !== requestId.current) return false
      if (error) {
        setLoadError(t("genericError"))
        return false
      }
      setSessions(data ?? [])
      return true
    } catch {
      if (mountedRef.current && id === requestId.current) {
        setLoadError(t("genericError"))
      }
      return false
    } finally {
      if (mountedRef.current && id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    void Promise.resolve().then(loadSessions)

    return () => {
      mountedRef.current = false
    }
  }, [])

  async function signOutSession(token: string) {
    setRevokingToken(token)
    try {
      const { error } = await authClient.revokeSession({ token })
      if (error) {
        toast.add({
          type: "error",
          title: t("couldNotRevokeSession"),
          description: t("genericError"),
        })
        return
      }
      await loadSessions()
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotRevokeSession"),
        description: t("genericError"),
      })
    } finally {
      if (mountedRef.current) setRevokingToken(null)
    }
  }

  async function signOutOtherSessions() {
    setRevokingOthers(true)
    try {
      const { error } = await authClient.revokeOtherSessions()
      if (error) {
        toast.add({
          type: "error",
          title: t("couldNotRevokeOtherSessions"),
          description: t("genericError"),
        })
        return
      }
      await loadSessions()
    } catch {
      toast.add({
        type: "error",
        title: t("couldNotRevokeOtherSessions"),
        description: t("genericError"),
      })
    } finally {
      if (mountedRef.current) setRevokingOthers(false)
    }
  }

  if (sessionPending) return <SessionsSkeleton />
  if (sessionError)
    return (
      <SettingsGroup
        title={t("sessions")}
        description={t("sessionsDescription")}
      >
        <SettingsRow>
          <ItemContent>
            <ItemTitle>{t("couldNotLoadSessions")}</ItemTitle>
            <ItemDescription>{t("genericError")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetchSession()}
            >
              {t("retry")}
            </Button>
          </ItemActions>
        </SettingsRow>
      </SettingsGroup>
    )
  if (!session) return null

  const currentSessionId = session.session.id
  const current =
    sessions.find((item) => item.id === currentSessionId) ?? session.session
  const others = sessions.filter((item) => item.id !== currentSessionId)

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup
        title={t("sessions")}
        description={t("sessionsDescription")}
      >
        <SettingsRow size="sm">
          <DeviceIcon userAgent={current.userAgent} />
          <ItemContent>
            <ItemTitle>{describeDevice(current.userAgent)}</ItemTitle>
            <ItemDescription className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-emerald-500">
                <span className="size-1.5 rounded-full bg-current" />
                {t("currentSession")}
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
      ) : loadError ? (
        <SettingsRows>
          <SettingsRow>
            <ItemContent>
              <ItemTitle>{t("couldNotLoadOtherSessions")}</ItemTitle>
              <ItemDescription>{loadError}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadSessions()}
              >
                {t("retry")}
              </Button>
            </ItemActions>
          </SettingsRow>
        </SettingsRows>
      ) : others.length > 0 ? (
        <SettingsRows>
          <SettingsRow>
            <ItemContent>
              <ItemTitle>
                {t("otherSessionCount", { count: others.length })}
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                disabled={revokingOthers}
                onClick={signOutOtherSessions}
              >
                {revokingOthers && <Spinner />}{t("revokeAll")}
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
                <ItemTitle>{describeDevice(item.userAgent)}</ItemTitle>
                <ItemDescription>
                  {displayIp(item.ipAddress)
                    ? `${displayIp(item.ipAddress)} · `
                    : ""}
                  {t("lastSeen", {
                    time: format.relativeTime(new Date(item.updatedAt)),
                  })}
                </ItemDescription>
              </ItemContent>
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
                  {revokingToken === item.token && <Spinner />}{t("revoke")}
                </Button>
              </ItemActions>
            </SettingsRow>
          ))}
        </SettingsRows>
      ) : null}
    </div>
  )
}
