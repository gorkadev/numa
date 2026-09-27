"use client"

import { useTranslations } from "next-intl"
import { SidebarProvider } from "@workspace/ui/components/sidebar"

export function LocalizedSidebarProvider({
  children,
  ...props
}: React.ComponentProps<typeof SidebarProvider>) {
  const t = useTranslations("Shell")

  return (
    <SidebarProvider
      {...props}
      drawerTitle={t("sidebarDrawerTitle")}
      drawerDescription={t("sidebarDrawerDescription")}
      toggleLabel={t("toggleSidebar")}
    >
      {children}
    </SidebarProvider>
  )
}
