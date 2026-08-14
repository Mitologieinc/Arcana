export function greeting() {
  const h = new Date().getHours();
  if (h < 5 || h >= 18) return "こんばんは";
  if (h < 11) return "おはようございます";
  return "こんにちは";
}

export function relativeTime(value: string | number | Date) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}日前`;
  return new Date(t).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export function roleLabel(role: string) {
  switch (role) {
    case "owner":
      return "オーナー";
    case "admin":
      return "管理者";
    case "member":
      return "メンバー";
    case "guest":
      return "ゲスト";
    default:
      return role;
  }
}

export function permissionLabel(permission: string) {
  switch (permission) {
    case "full":
      return "フルアクセス";
    case "edit":
      return "編集可";
    case "view":
      return "閲覧のみ";
    case "none":
      return "アクセスなし";
    default:
      return permission;
  }
}
