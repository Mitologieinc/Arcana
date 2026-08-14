import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  pageAcl,
  pages,
  shareLinks,
  workspaceMembers,
  workspaces,
  PERMISSION_RANK,
  type Permission,
  type MemberRole,
} from "../db/schema";

export function canEdit(permission: Permission) {
  return PERMISSION_RANK[permission] >= PERMISSION_RANK.edit;
}

export function canView(permission: Permission) {
  return PERMISSION_RANK[permission] >= PERMISSION_RANK.view;
}

export function shareLinkUnexpired(link: { expiresAt: Date | null }) {
  return !link.expiresAt || link.expiresAt.getTime() > Date.now();
}

export async function workspaceAllowsShareLinks(db: Database, workspaceId: string) {
  const rows = await db
    .select({ shareLinksEnabled: workspaces.shareLinksEnabled })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return rows[0]?.shareLinksEnabled !== false;
}

function defaultPermission(role: MemberRole | null): Permission {
  if (!role) return "none";
  if (role === "guest") return "none";
  return "full";
}

export async function resolvePagePermission(
  db: Database,
  opts: {
    pageId: string;
    userId?: string | null;
    shareToken?: string | null;
  },
): Promise<{ permission: Permission; workspaceId: string; role: MemberRole | null }> {
  const pageRows = await db.select().from(pages).where(eq(pages.id, opts.pageId)).limit(1);
  const page = pageRows[0];
  if (!page || page.archivedAt) {
    return { permission: "none", workspaceId: "", role: null };
  }

  if (opts.shareToken) {
    const links = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, opts.shareToken))
      .limit(1);
    const link = links[0];
    if (link && shareLinkUnexpired(link) && (await workspaceAllowsShareLinks(db, page.workspaceId))) {
      const chain = await collectPageChain(db, page.id);
      if (chain.some((p) => p.id === link.pageId) || link.pageId === page.id) {
        const inherited = await permissionFromAncestors(db, page.id, opts.userId ?? null, null);
        const sharePerm = link.permission;
        const best =
          PERMISSION_RANK[sharePerm] >= PERMISSION_RANK[inherited]
            ? sharePerm
            : inherited;
        return { permission: best, workspaceId: page.workspaceId, role: null };
      }
    }
  }

  let role: MemberRole | null = null;
  if (opts.userId) {
    const members = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, page.workspaceId),
          eq(workspaceMembers.userId, opts.userId),
        ),
      )
      .limit(1);
    role = members[0]?.role ?? null;
  }

  const permission = await permissionFromAncestors(db, page.id, opts.userId ?? null, role);
  return { permission, workspaceId: page.workspaceId, role };
}

async function collectPageChain(db: Database, pageId: string) {
  const chain: (typeof pages.$inferSelect)[] = [];
  let currentId: string | null = pageId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const rows = await db.select().from(pages).where(eq(pages.id, currentId)).limit(1);
    const row = rows[0];
    if (!row) break;
    chain.push(row);
    currentId = row.parentId;
  }
  return chain;
}

async function permissionFromAncestors(
  db: Database,
  pageId: string,
  userId: string | null,
  role: MemberRole | null,
): Promise<Permission> {
  const chain = await collectPageChain(db, pageId);
  for (const page of chain) {
    const acls = await db.select().from(pageAcl).where(eq(pageAcl.pageId, page.id));
    if (acls.length === 0) continue;
    const userAcl = userId
      ? acls.find((a) => a.principalType === "user" && a.principalId === userId)
      : undefined;
    if (userAcl) return userAcl.permission;
    const wsAcl = acls.find((a) => a.principalType === "workspace");
    if (wsAcl) return wsAcl.permission;
  }
  return defaultPermission(role);
}

export async function listVisiblePages(db: Database, workspaceId: string, userId: string, role: MemberRole) {
  const all = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), isNull(pages.archivedAt)));

  const visible: typeof all = [];
  for (const page of all) {
    const { permission } = await resolvePagePermission(db, { pageId: page.id, userId });
    if (canView(permission)) visible.push(page);
  }
  return visible;
}
