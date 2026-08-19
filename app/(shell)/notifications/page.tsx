"use client";

import RequireAuth from "@/app/components/RequireAuth";
import NotificationPanel from "@/app/components/shell/NotificationPanel";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <NotificationPanel />
      </div>
    </RequireAuth>
  );
}
