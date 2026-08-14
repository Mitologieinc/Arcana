import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { withCollaboration } from "@blocknote/core/yjs";
import { ja } from "@blocknote/core/locales";
import { Share2, Trash2, SmilePlus, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import type { DbProperty, DbView, Page, Permission, User } from "../lib/types";
import { DatabaseView } from "./DatabaseView";
import { ShareDialog } from "./ShareDialog";

type Props = {
  pageId: string;
  user: User;
  shareToken?: string;
  pages?: Page[];
  fallback?: Page | null;
  forcedPermission?: Permission;
  onPagesChanged: () => Promise<unknown>;
  onOpenPage: (id: string) => void;
};

const COLORS = ["#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#196a63"];
const PAGE_ICONS = ["📄", "📝", "📚", "💡", "✅", "🎯", "🚀", "⭐", "🔥", "❤️", "🧩", "🗃️", "🏠", "📅", "🧠", "✨"];

function colorFor(id: string) {
  let n = 0;
  for (const ch of id) n += ch.charCodeAt(0);
  return COLORS[n % COLORS.length];
}

function CollabEditor({
  pageId,
  user,
  shareToken,
  editable,
  title,
}: {
  pageId: string;
  user: User;
  shareToken?: string;
  editable: boolean;
  title: string;
}) {
  const indexTimer = useRef<number | null>(null);

  const collab = useMemo(() => {
    const doc = new Y.Doc();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params: Record<string, string> = {};
    if (shareToken) params.token = shareToken;
    const provider = new WebsocketProvider(`${proto}//${location.host}/api/collab`, pageId, doc, {
      params,
    });
    return { doc, provider };
  }, [pageId, shareToken]);

  useEffect(() => {
    return () => {
      collab.provider.destroy();
      collab.doc.destroy();
    };
  }, [collab]);

  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary: ja,
      trailingBlock: true,
      animations: true,
      uploadFile: async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = (await res.json()) as { url: string };
        return data.url;
      },
      collaboration: {
        fragment: collab.doc.getXmlFragment("document-store"),
        provider: collab.provider,
        user: { name: user.name || "ゲスト", color: colorFor(user.id) },
      },
    }),
  );

  function scheduleIndex() {
    if (!editable) return;
    if (indexTimer.current) window.clearTimeout(indexTimer.current);
    indexTimer.current = window.setTimeout(() => {
      const bodyText = blocksToText(editor.document as unknown[]);
      void api(`/api/pages/${pageId}/index`, {
        method: "POST",
        body: JSON.stringify({ title, bodyText }),
      });
    }, 1500);
  }

  return (
    <div
      className="min-h-[55vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) editor.focus();
      }}
    >
      <BlockNoteView editor={editor} editable={editable} theme="light" slashMenu sideMenu formattingToolbar onChange={scheduleIndex} />
    </div>
  );
}

function blocksToText(blocks: unknown[]): string {
  return blocks
    .map((raw) => {
      const block = raw as { content?: unknown; children?: unknown[] };
      const inline = Array.isArray(block.content)
        ? (block.content as { text?: string }[]).map((c) => c.text ?? "").join("")
        : typeof block.content === "string"
          ? block.content
          : "";
      const kids = block.children ? blocksToText(block.children) : "";
      return [inline, kids].filter(Boolean).join("\n");
    })
    .join("\n");
}

export function PageEditor({
  pageId,
  user,
  shareToken,
  pages = [],
  fallback,
  forcedPermission,
  onPagesChanged,
  onOpenPage,
}: Props) {
  const [page, setPage] = useState<Page | null>(fallback ?? null);
  const [permission, setPermission] = useState<Permission>(forcedPermission ?? "view");
  const [children, setChildren] = useState<Page[]>([]);
  const [dbSchema, setDbSchema] = useState<DbProperty[]>([]);
  const [dbViews, setDbViews] = useState<DbView[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [title, setTitle] = useState(fallback?.title ?? "");

  useEffect(() => {
    const q = shareToken ? `?token=${encodeURIComponent(shareToken)}` : "";
    api<{
      page: Page;
      children: Page[];
      permission: Permission;
      database: { schema: DbProperty[]; views: DbView[] } | null;
    }>(`/api/pages/${pageId}${q}`)
      .then((d) => {
        setPage(d.page);
        setTitle(d.page.title);
        setChildren(d.children);
        setPermission(d.permission);
        setDbSchema(d.database?.schema ?? []);
        setDbViews(d.database?.views ?? []);
      })
      .catch(console.error);
  }, [pageId, shareToken]);

  const editable = permission === "full" || permission === "edit";

  async function saveTitle(next: string) {
    setTitle(next);
    if (!editable) return;
    await api(`/api/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: next }),
    });
    await onPagesChanged();
  }

  async function saveIcon(icon: string | null) {
    if (!editable) return;
    setIconOpen(false);
    setPage((p) => (p ? { ...p, icon } : p));
    await api(`/api/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ icon }),
    });
    await onPagesChanged();
  }

  async function remove() {
    if (!confirm("このページを削除しますか？")) return;
    await api(`/api/pages/${pageId}`, { method: "DELETE" });
    await onPagesChanged();
    onOpenPage("");
  }

  const crumbs = useMemo(() => {
    if (!page) return [];
    const map = new Map(pages.map((p) => [p.id, p]));
    const chain: Page[] = [];
    let cur = page.parentId ? map.get(page.parentId) : undefined;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? map.get(cur.parentId) : undefined;
    }
    return chain;
  }, [page, pages]);

  if (!page) {
    return <div className="p-10 text-muted">読み込み中…</div>;
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-[5] flex h-11 items-center justify-between bg-white/90 px-3 backdrop-blur-sm">
        <nav className="flex min-w-0 items-center gap-0.5 text-[13px] text-muted">
          {crumbs.map((c) => (
            <span key={c.id} className="flex min-w-0 items-center">
              <button
                className="max-w-[140px] truncate rounded px-1.5 py-0.5 hover:bg-hover"
                onClick={() => onOpenPage(c.id)}
              >
                {c.icon || "📄"} {c.title || "無題"}
              </button>
              <ChevronRight size={12} className="shrink-0 text-[#c4c2bc]" />
            </span>
          ))}
          <span className="truncate px-1.5 text-ink">{page.icon || "📄"} {title || "無題"}</span>
        </nav>
        {editable && !shareToken && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button className="btn-ghost h-8 px-2.5 text-[13px]" onClick={() => setShareOpen(true)}>
              <Share2 size={14} />
              共有
            </button>
            <button className="btn-ghost h-8 w-8 p-0 text-muted" onClick={remove} title="削除">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </header>
      <div className="group mx-auto max-w-[900px] pb-40 pt-16">
        <div className="relative mb-1 px-[54px]">
          {page.icon ? (
            <button
              className="mb-2 text-[72px] leading-none"
              onClick={() => editable && setIconOpen((v) => !v)}
              disabled={!editable}
            >
              {page.icon}
            </button>
          ) : (
            editable && (
              <button
                className={`mb-2 inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[14px] text-muted hover:bg-hover ${iconOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                onClick={() => setIconOpen((v) => !v)}
              >
                <SmilePlus size={16} />
                アイコンを追加
              </button>
            )
          )}
          {iconOpen && (
            <div className="absolute left-[54px] top-20 z-20 w-64 rounded-lg border border-line bg-white p-2 shadow-[0_4px_18px_rgba(0,0,0,0.12)]">
              <div className="grid grid-cols-8 gap-1">
                {PAGE_ICONS.map((emo) => (
                  <button
                    key={emo}
                    className="rounded-[6px] p-1 text-[20px] hover:bg-hover"
                    onClick={() => saveIcon(emo)}
                  >
                    {emo}
                  </button>
                ))}
              </div>
              {page.icon && (
                <button className="mt-1 w-full rounded-[6px] px-2 py-1 text-left text-[12px] text-muted hover:bg-hover" onClick={() => saveIcon(null)}>
                  アイコンを削除
                </button>
              )}
            </div>
          )}
        </div>
        <div className="px-[54px]">
          <input
            className="page-title"
            value={title}
            placeholder="無題"
            readOnly={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveTitle(title)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveTitle(title);
                document.querySelector<HTMLElement>(".bn-editor")?.focus();
              }
            }}
          />
        </div>
        {page.type === "database" ? (
          <div className="mt-6 px-[54px]">
          <DatabaseView
            pageId={pageId}
            schema={dbSchema}
            views={dbViews}
            rows={children}
            editable={editable}
            onOpenRow={onOpenPage}
            onChanged={async () => {
              const q = shareToken ? `?token=${encodeURIComponent(shareToken)}` : "";
              const d = await api<{
                children: Page[];
                database: { schema: DbProperty[]; views: DbView[] } | null;
              }>(`/api/pages/${pageId}${q}`);
              setChildren(d.children);
              setDbSchema(d.database?.schema ?? []);
              setDbViews(d.database?.views ?? []);
              await onPagesChanged();
            }}
          />
          </div>
        ) : (
          <CollabEditor
            pageId={pageId}
            user={user}
            shareToken={shareToken}
            editable={editable}
            title={title}
          />
        )}
      </div>
      {shareOpen && page && (
        <ShareDialog page={page} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
