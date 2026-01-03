import { Settings } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials, formatMemberSince } from "@/lib/utils";

interface UserProfileHeaderProps {
  name: string;
  avatarUrl?: string | null;
  memberSince: Date;
  settingsHref?: string;
}

export function UserProfileHeader({
  name,
  avatarUrl,
  memberSince,
  settingsHref,
}: UserProfileHeaderProps) {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="text-2xl">{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{name}</h1>
            <p className="text-sm text-muted-foreground">
              Member since {formatMemberSince(memberSince)}
            </p>
          </div>
        </div>
        {settingsHref && (
          <Button asChild className="w-fit">
            <Link href={settingsHref}>
              <Settings className="size-4 mr-2" />
              Settings
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
