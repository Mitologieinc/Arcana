import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { withCollaboration } from "@blocknote/core/yjs";
import { ja } from "@blocknote/core/locales";
import { Share2, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { DbProperty, DbView, Page, Permission, User } from "../lib/types";
import { DatabaseView } from "./DatabaseView";
import { ShareDialog } from "./ShareDialog";

type Props = {
  pageId: string;
  user: User;
  shareToken?: string;
  fallback?: Page | null;
  forcedPermission?: Permission;
  onPagesChanged: () => Promise<unknown>;
  onOpenPage: (id: string) => void;
};

const COLORS = ["#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#196a63"];

function colorFor(id: string) {
  let n = 0;
  for (const ch of id) n += ch.charCodeAt(0);
  return COLORS[n % COLORS.length];
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
  const [title, setTitle] = useState(fallback?.title ?? "");
  const indexTimer = useRef<number | null>(null);

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

  async function saveTitle(next: string) {
    setTitle(next);
    if (!editable) return;
    await api(`/api/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: next }),
    });
    await onPagesChanged();
    scheduleIndex();
  }

  async function remove() {
    if (!confirm("このページを削除しますか？")) return;
    await api(`/api/pages/${pageId}`, { method: "DELETE" });
    await onPagesChanged();
    onOpenPage("");
  }

  if (!page) {
    return <div className="p-10 text-muted">読み込み中…</div>;
  }

  return (
    <div className="min-h-full">
      <header className="flex h-12 items-center justify-end gap-1 border-b border-line px-4">
        {editable && !shareToken && (
          <>
            <button className="btn btn-secondary h-8 px-3 text-[12px]" onClick={() => setShareOpen(true)}>
              <Share2 size={13} />
              共有
            </button>
            <button className="btn-ghost p-2 text-muted" onClick={remove} title="削除">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </header>
      <div className="mx-auto max-w-3xl px-10 pb-24 pt-10">
        <input
          className="w-full border-none bg-transparent text-[40px] font-semibold tracking-tight outline-none placeholder:text-line"
          value={title}
          placeholder="無題"
          readOnly={!editable}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveTitle(title)}
        />
        {page.type === "database" ? (
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
        ) : (
          <div className="mt-4" onKeyUp={scheduleIndex}>
            <BlockNoteView editor={editor} editable={editable} theme="light" />
          </div>
        )}
      </div>
      {shareOpen && page && (
        <ShareDialog page={page} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
