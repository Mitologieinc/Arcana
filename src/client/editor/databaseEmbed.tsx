import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { lazy, Suspense, useEffect, useState, type MouseEvent } from "react";
import { DatabaseView } from "../components/DatabaseView";
import { api } from "../lib/api";
import type { DbProperty, DbView, Member, Page, Permission } from "../lib/types";
import { useEditorChrome } from "./chrome";
import { PageIcon } from "../components/PageIcon";

const RowPeek = lazy(() => import("../components/RowPeek").then((m) => ({ default: m.RowPeek })));

function DatabaseEmbedView({ node, selected }: ReactNodeViewProps) {
  const chrome = useEditorChrome();
  const embedId = String(node.attrs.pageId ?? "");
  const [page, setPage] = useState<Page | null>(null);
  const [schema, setSchema] = useState<DbProperty[]>([]);
  const [views, setViews] = useState<DbView[]>([]);
  const [rows, setRows] = useState<Page[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [permission, setPermission] = useState<Permission>("view");
  const [peekId, setPeekId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!embedId) return;
    const q = chrome?.shareToken ? `?token=${encodeURIComponent(chrome.shareToken)}` : "";
    const d = await api<{
      page: Page;
      children: Page[];
      permission: Permission;
      database: { schema: DbProperty[]; views: DbView[] } | null;
    }>(`/api/pages/${embedId}${q}`);
    setPage(d.page);
    setRows(d.children);
    setPermission(d.permission);
    setSchema(d.database?.schema ?? []);
    setViews(d.database?.views ?? []);
  }

  useEffect(() => {
    setPeekId(null);
    setError(null);
    reload().catch((err: Error) => setError(err.message || "読み込めません"));
    api<{ pages: Page[] }>("/api/pages")
      .then((d) => setPages(d.pages))
      .catch(() => undefined);
    api<{ members: Member[] }>("/api/members")
      .then((d) => setMembers(d.members))
      .catch(() => undefined);
  }, [embedId, chrome?.shareToken]);

  const peekRow = rows.find((r) => r.id === peekId) ?? null;
  const editable = (permission === "full" || permission === "edit") && (chrome?.editable ?? false);

  return (
    <NodeViewWrapper
      className={`arcana-db-embed ${selected ? "is-selected" : ""}`}
      data-type="database-embed"
      data-page-id={embedId}
      contentEditable={false}
      onMouseDown={(e: MouseEvent) => e.stopPropagation()}
    >
      {error ? (
        <p className="px-1 py-3 text-[13px] text-muted">{error}</p>
      ) : !page ? (
        <div className="py-3">
          <div className="skeleton mb-2 h-5 w-40" />
          <div className="skeleton h-24 w-full" />
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              className="min-w-0 truncate rounded-[6px] px-1 py-0.5 text-left text-[15px] font-medium hover:bg-hover"
              onClick={() => chrome?.onOpenPage?.(embedId)}
            >
              <span className="inline-flex items-center gap-1">
                <PageIcon icon={page.icon} fallback="🗃️" size={16} />
                {page.title || "無題のデータベース"}
              </span>
            </button>
          </div>
          <DatabaseView
            pageId={embedId}
            schema={schema}
            views={views}
            rows={rows}
            pages={pages}
            members={members}
            editable={editable}
            embedded
            onOpenRow={setPeekId}
            onChanged={async () => {
              await reload();
              await chrome?.onPagesChanged?.();
            }}
          />
        </>
      )}
      {peekRow && chrome && (
        <Suspense fallback={null}>
          <RowPeek
            page={peekRow}
            schema={schema}
            user={chrome.user}
            editable={editable}
            shareToken={chrome.shareToken}
            onClose={() => setPeekId(null)}
            onOpenPage={() => {
              setPeekId(null);
              chrome.onOpenPage?.(peekRow.id);
            }}
            onChanged={async () => {
              await reload();
              await chrome.onPagesChanged?.();
            }}
            onDelete={async () => {
              await api(`/api/pages/${peekRow.id}`, { method: "DELETE" });
              setPeekId(null);
              await reload();
              await chrome.onPagesChanged?.();
            }}
          />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}

export const DatabaseEmbed = Node.create({
  name: "databaseEmbed",
  group: "block",
  atom: true,
  draggable: true,
  isolating: true,
  addAttributes() {
    return {
      pageId: { default: "" },
      title: { default: "無題のデータベース" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="database-embed"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "database-embed",
        "data-page-id": HTMLAttributes.pageId,
        class: "arcana-db-embed",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseEmbedView);
  },
});
