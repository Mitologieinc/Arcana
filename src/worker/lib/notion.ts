const NOTION_VERSION = "2022-06-28";
const BASE = "https://api.notion.com/v1";

export type NotionParent = {
  type: string;
  page_id?: string;
  database_id?: string;
  block_id?: string;
};

export type NotionSearchItem = {
  id: string;
  object: "page" | "database";
  archived?: boolean;
  icon?: { type?: string; emoji?: string } | null;
  parent: NotionParent;
  title: string;
};

type NotionList<T> = {
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
};

export async function notionFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let lastError = "Notion API に接続できませんでした";
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("Retry-After") || 1) * 1000;
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
      continue;
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      lastError = err.message || `Notion API が ${res.status} を返しました`;
      if (res.status === 401 || res.status === 403) throw new Error("API キーが無効か、ページが共有されていません");
      throw new Error(lastError);
    }
    return (await res.json()) as T;
  }
  throw new Error(lastError);
}

export function richPlain(rich: unknown): string {
  if (!Array.isArray(rich)) return "";
  return rich.map((t) => (t as { plain_text?: string }).plain_text ?? "").join("");
}

function pageTitle(item: Record<string, unknown>): string {
  if (item.object === "database" && Array.isArray(item.title)) return richPlain(item.title) || "無題のデータベース";
  const props = item.properties as Record<string, { type?: string; title?: unknown }> | undefined;
  if (!props) return "無題";
  const titleProp = Object.values(props).find((p) => p.type === "title");
  return richPlain(titleProp?.title) || "無題";
}

export async function notionWhoAmI(token: string) {
  const me = await notionFetch<{
    name?: string;
    bot?: { owner?: { type?: string; workspace?: boolean; user?: { name?: string } } };
  }>(token, "/users/me");
  return { name: me.name || "Notion 連携" };
}

export async function notionSearchPage(token: string, cursor?: string | null) {
  const data = await notionFetch<NotionList<Record<string, unknown>>>(token, "/search", {
    method: "POST",
    body: JSON.stringify({
      page_size: 100,
      start_cursor: cursor || undefined,
    }),
  });
  const results: NotionSearchItem[] = [];
  for (const raw of data.results) {
    if (raw.archived) continue;
    const object = raw.object === "database" ? "database" : raw.object === "page" ? "page" : null;
    if (!object) continue;
    const icon = raw.icon as NotionSearchItem["icon"];
    results.push({
      id: String(raw.id),
      object,
      icon,
      parent: (raw.parent as NotionParent) ?? { type: "workspace" },
      title: pageTitle(raw),
    });
  }
  return { results, next_cursor: data.next_cursor, has_more: data.has_more };
}

export async function notionDatabase(token: string, id: string) {
  return notionFetch<Record<string, unknown>>(token, `/databases/${id}`);
}

export async function notionQueryDatabase(token: string, id: string, cursor?: string | null) {
  return notionFetch<NotionList<Record<string, unknown>>>(token, `/databases/${id}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 30, start_cursor: cursor || undefined }),
  });
}

export async function notionPage(token: string, id: string) {
  return notionFetch<Record<string, unknown>>(token, `/pages/${id}`);
}

export async function notionBlockChildren(token: string, id: string) {
  const blocks: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams({ page_size: "100" });
    if (cursor) q.set("start_cursor", cursor);
    const data = await notionFetch<NotionList<Record<string, unknown>>>(token, `/blocks/${id}/children?${q}`);
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return blocks;
}

export async function loadNestedBlocks(token: string, blocks: Record<string, unknown>[]) {
  for (const block of blocks) {
    if (!block.has_children) continue;
    const type = String(block.type ?? "");
    if (type === "child_page" || type === "child_database") continue;
    const children = await notionBlockChildren(token, String(block.id));
    block.children = children;
    await loadNestedBlocks(token, children);
  }
  return blocks;
}
