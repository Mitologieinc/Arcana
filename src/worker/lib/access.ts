export function parseDomains(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((d) => d.replace(/^@/, "").toLowerCase().trim())
    .filter(Boolean);
}

export function normalizeDomains(raw: string | null | undefined): string {
  return parseDomains(raw).join(", ");
}

export function emailAllowed(email: string, allowedDomains: string | null | undefined): boolean {
  const list = parseDomains(allowedDomains);
  if (!list.length) return true;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return false;
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}
