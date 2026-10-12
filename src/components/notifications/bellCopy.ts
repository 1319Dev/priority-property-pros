export function bellBadgeLabel(unread: number, attention: number): string {
  const parts: string[] = [];
  if (unread > 0) parts.push(`${unread} unread`);
  if (attention > 0) parts.push(`${attention} ${attention === 1 ? "item needs" : "items need"} attention`);
  return parts.length > 0 ? `Notifications, ${parts.join(", ")}` : "Notifications";
}

export function notificationHistoryPath(accountType: string | null | undefined): string | null {
  if (accountType === "CONTRACTOR") return "/app/pro/notifications";
  if (accountType === "CUSTOMER") return "/app/customer/notifications";
  if (accountType === "ADMIN") return "/app/admin/notifications";
  return null;
}
