"use client";

import {
  IconHistory,
  IconMail,
  IconServer,
  IconSettings,
  IconShield,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import type * as React from "react";
import { useMemo } from "react";
import { type NavGroup, NavMain } from "@/components/layout/nav-main";
import { NavSecondary } from "@/components/layout/nav-secondary";
import { NavUser, type NavUserProps } from "@/components/layout/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

const navGroups: NavGroup[] = [
  {
    label: "Invites",
    adminOnly: true,
    items: [
      {
        title: "Invites",
        url: "/invites",
        icon: IconMail,
      },
      {
        title: "Profiles",
        url: "/profiles",
        icon: IconUser,
      },
      {
        title: "History",
        url: "/invites/history",
        icon: IconHistory,
      },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      {
        title: "Users",
        url: "/users",
        icon: IconUsers,
      },
      {
        title: "Security",
        url: "/dashboard/security",
        icon: IconShield,
      },
    ],
  },
];

const navSecondary = [
  {
    title: "Settings",
    url: "/settings",
    icon: IconSettings,
  },
];

export interface ServerInfo {
  name: string;
  version: string;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: NavUserProps["user"];
  serverInfo?: ServerInfo;
  isAdmin?: boolean;
}

export function AppSidebar({ user, serverInfo, isAdmin = false, ...props }: AppSidebarProps) {
  const visibleGroups = useMemo(() => {
    return navGroups.filter((group) => !group.adminOnly || isAdmin);
  }, [isAdmin]);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-2! data-[slot=sidebar-menu-button]:h-auto!"
            >
              <Link href="/dashboard">
                <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <IconServer className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  {serverInfo ? (
                    <>
                      <span className="font-medium">{serverInfo.name}</span>
                      <span className="text-xs text-muted-foreground">v{serverInfo.version}</span>
                    </>
                  ) : (
                    <>
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </>
                  )}
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={visibleGroups} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
