"use client";

import { Card, CardContent } from "@/components/ui/card";
import { IconClock } from "@tabler/icons-react";

export function ServerSettingsTab() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <IconClock className="size-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium text-muted-foreground">Coming Soon</p>
        <p className="text-sm text-muted-foreground">Server settings will be available in a future update.</p>
      </CardContent>
    </Card>
  );
}
