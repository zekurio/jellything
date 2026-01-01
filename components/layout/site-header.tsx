import { IconHome } from "@tabler/icons-react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem as BreadcrumbItemUI,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

export interface BreadcrumbItemProps {
  label: string;
  href?: string;
  avatarUrl?: string;
}

interface SiteHeaderProps {
  breadcrumbs?: BreadcrumbItemProps[];
}

export function SiteHeader({ breadcrumbs }: SiteHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-16">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItemUI>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">
                  <IconHome className="size-4" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItemUI>
            {breadcrumbs?.map((item) => (
              <span key={item.label} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItemUI>
                  {item.avatarUrl ? (
                    <span className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={item.avatarUrl} alt={item.label} />
                        <AvatarFallback className="text-xs">
                          {getInitials(item.label)}
                        </AvatarFallback>
                      </Avatar>
                      {item.href ? (
                        <BreadcrumbLink asChild>
                          <Link href={item.href}>{item.label}</Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{item.label}</BreadcrumbPage>
                      )}
                    </span>
                  ) : item.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItemUI>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
