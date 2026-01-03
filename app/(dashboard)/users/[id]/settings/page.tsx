"use client";

import { useParams } from "next/navigation";
import { UserSettings } from "@/components/users/user-settings";

export default function UserSettingsPage() {
  const params = useParams<{ id: string }>();

  return <UserSettings userId={params.id} />;
}
