import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronRight, MoreHorizontal, SmilePlus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { DbProperty, DbView, Page, Permission, User } from "../lib/types";
import { DatabaseView } from "./DatabaseView";
import { ShareDialog } from "./ShareDialog";
import { TiptapEditor } from "../editor/TiptapEditor";

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

const PAGE_ICONS = ["📄", "📝", "📚", "💡", "✅", "🎯", "🚀", "⭐", "🔥", "❤️", "🧩", "🗃️", "🏠", "📅", "🧠", "✨"];

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
  const [moreOpen, setMoreOpen] = useState(false);
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

  useEffect(() => {
    if (!moreOpen && !iconOpen) return;
    const close = () => {
      setMoreOpen(false);
      setIconOpen(false);
    };
    const t = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [moreOpen, iconOpen]);

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
    return (
      <div className="mx-auto max-w-[900px] px-24 pt-28">
        <div className="skeleton mb-6 h-16 w-16 rounded-xl" />
        <div className="skeleton h-10 w-2/3" />
        <div className="skeleton mt-8 h-4 w-full" />
        <div className="skeleton mt-3 h-4 w-5/6" />
        <div className="skeleton mt-3 h-4 w-3/4" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-[5] flex h-10 items-center justify-between bg-white/75 px-3 backdrop-blur-md">
        <nav className="flex min-w-0 items-center gap-0.5 text-[13px] text-muted">
          {crumbs.map((c) => (
            <span key={c.id} className="flex min-w-0 items-center">
              <button
                className="max-w-[140px] truncate rounded-[5px] px-1.5 py-0.5 hover:bg-hover"
                onClick={() => onOpenPage(c.id)}
              >
                {c.icon || "📄"} {c.title || "無題"}
              </button>
              <ChevronRight size={12} className="shrink-0 text-[#c4c2bc]" />
            </span>
          ))}
          <span className="truncate rounded-[5px] px-1.5 py-0.5 text-ink">
            {page.icon || "📄"} {title || "無題"}
          </span>
        </nav>
        {editable && !shareToken && (
          <div className="relative flex shrink-0 items-center gap-0.5">
            <button className="h-8 px-2.5 text-[13px] text-muted hover:text-ink" onClick={() => setShareOpen(true)}>
              共有
            </button>
            <button
              className="btn-ghost h-8 w-8 p-0 text-muted"
              onClick={() => setMoreOpen((v) => !v)}
              title="その他"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <div className="menu-panel absolute right-0 top-9 z-20 w-44 p-1" onClick={(e) => e.stopPropagation()}>
                <button
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-hover"
                  onClick={() => {
                    setMoreOpen(false);
                    void remove();
                  }}
                >
                  <Trash2 size={14} />
                  ページを削除
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      <div className="group mx-auto max-w-[900px] pb-40 pt-20">
        <div className="relative mb-1 px-24 max-[860px]:px-6">
          {page.icon ? (
            <button
              className="mb-1 rounded-xl text-[78px] leading-none transition hover:bg-hover"
              onClick={() => editable && setIconOpen((v) => !v)}
              disabled={!editable}
            >
              {page.icon}
            </button>
          ) : (
            editable && (
              <button
                className={`mb-2 inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[14px] text-muted hover:bg-hover ${iconOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                onClick={() => setIconOpen((v) => !v)}
              >
                <SmilePlus size={15} />
                アイコンを追加
              </button>
            )
          )}
          {iconOpen && (
            <div className="menu-panel absolute left-24 top-[5.5rem] z-20 w-72 p-2 max-[860px]:left-6" onClick={(e) => e.stopPropagation()}>
              <p className="px-1.5 pb-2 text-[11px] font-medium text-muted">アイコン</p>
              <div className="grid grid-cols-8 gap-0.5">
                {PAGE_ICONS.map((emo) => (
                  <button
                    key={emo}
                    className="rounded-[6px] p-1.5 text-[20px] hover:bg-hover"
                    onClick={() => saveIcon(emo)}
                  >
                    {emo}
                  </button>
                ))}
              </div>
              {page.icon && (
                <button
                  className="mt-1.5 w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-hover"
                  onClick={() => saveIcon(null)}
                >
                  アイコンを削除
                </button>
              )}
            </div>
          )}
        </div>
        <div className="px-24 max-[860px]:px-6">
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
                document.querySelector<HTMLElement>(".arcana-doc")?.focus();
              }
            }}
          />
        </div>
        {page.type === "database" ? (
          <div className="mt-6 px-24 max-[860px]:px-6">
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
          <TiptapEditor
            key={pageId}
            pageId={pageId}
            user={user}
            shareToken={shareToken}
            editable={editable}
            title={title}
          />
        )}
      </div>
      {shareOpen && page && <ShareDialog page={page} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
