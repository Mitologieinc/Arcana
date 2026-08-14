import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { ChevronsRight, ChevronRight, Clock, Download, ImagePlus, Link2, MessageSquare, MoreHorizontal, SmilePlus, Star, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { DbProperty, DbView, Member, Page, Permission, User } from "../lib/types";
import { DatabaseView } from "./DatabaseView";
import { parseProps, PropertyIcon, PropertyValue } from "./PropertyValue";
import { RowPeek } from "./RowPeek";
import { ShareDialog } from "./ShareDialog";
import { CommentsPanel } from "./CommentsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TiptapEditor } from "../editor/TiptapEditor";
import { uploadImage } from "../editor/slash";

type Props = {
  pageId: string;
  user: User;
  shareToken?: string;
  pages?: Page[];
  fallback?: Page | null;
  forcedPermission?: Permission;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
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
  sidebarCollapsed,
  onExpandSidebar,
  onPagesChanged,
  onOpenPage,
}: Props) {
  const location = useLocation();
  const titleRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState<Page | null>(fallback ?? null);
  const [permission, setPermission] = useState<Permission>(forcedPermission ?? "view");
  const [children, setChildren] = useState<Page[]>([]);
  const [dbSchema, setDbSchema] = useState<DbProperty[]>([]);
  const [dbViews, setDbViews] = useState<DbView[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [title, setTitle] = useState(fallback?.title ?? "");
  const [peekId, setPeekId] = useState<string | null>(null);
  const [parentSchema, setParentSchema] = useState<DbProperty[]>([]);
  const [favorited, setFavorited] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  async function reloadPage() {
    const q = shareToken ? `?token=${encodeURIComponent(shareToken)}` : "";
    const d = await api<{
      page: Page;
      children: Page[];
      permission: Permission;
      database: { schema: DbProperty[]; views: DbView[] } | null;
      parentDatabase: { schema: DbProperty[] } | null;
    }>(`/api/pages/${pageId}${q}`);
    setPage(d.page);
    setTitle(d.page.title);
    setChildren(d.children);
    setPermission(d.permission);
    setDbSchema(d.database?.schema ?? []);
    setDbViews(d.database?.views ?? []);
    setParentSchema(d.parentDatabase?.schema ?? []);
    return d;
  }

  useEffect(() => {
    setPeekId(null);
    reloadPage().catch(console.error);
    api<{ pages: Page[] }>("/api/favorites")
      .then((d) => setFavorited(d.pages.some((p) => p.id === pageId)))
      .catch(() => undefined);
    api<{ members: Member[] }>("/api/members")
      .then((d) => setMembers(d.members))
      .catch(() => undefined);
  }, [pageId, shareToken]);

  useEffect(() => {
    if ((location.state as { focusTitle?: boolean } | null)?.focusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [pageId, location.state]);

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

  async function saveCover(file: File | null) {
    if (!editable) return;
    if (!file) {
      setPage((p) => (p ? { ...p, coverR2Key: null } : p));
      await api(`/api/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ coverR2Key: null }) });
      return;
    }
    const src = await uploadImage(file);
    const id = src.split("/").pop() ?? null;
    setPage((p) => (p ? { ...p, coverR2Key: id } : p));
    await api(`/api/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ coverR2Key: id }) });
  }

  function pickCover() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void saveCover(file);
    };
    input.click();
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
    await api(`/api/pages/${pageId}`, { method: "DELETE" });
    await onPagesChanged();
    onOpenPage("");
  }

  async function saveProp(id: string, value: unknown) {
    if (!editable || !page) return;
    const next = { ...parseProps(page.properties), [id]: value };
    setPage({ ...page, properties: JSON.stringify(next) });
    await api(`/api/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: next }),
    });
    await onPagesChanged();
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

  const pageProps = parseProps(page?.properties ?? null);
  const parentFields = parentSchema.filter((p) => p.type !== "title");
  const peekRow = children.find((r) => r.id === peekId) ?? null;

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
          {sidebarCollapsed && (
            <button
              className="btn-ghost mr-1 h-7 w-7 p-0 text-muted"
              onClick={onExpandSidebar}
              title="サイドバーを開く"
            >
              <ChevronsRight size={15} />
            </button>
          )}
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
        {!shareToken && (
          <div className="relative flex shrink-0 items-center gap-0.5">
            <button
              className={`btn-ghost h-8 w-8 p-0 ${favorited ? "text-[#d9730d]" : "text-muted"}`}
              title="お気に入り"
              onClick={async () => {
                const d = await api<{ favorited: boolean }>(`/api/favorites/${pageId}`, { method: "PUT" });
                setFavorited(d.favorited);
                await onPagesChanged();
              }}
            >
              <Star size={15} fill={favorited ? "currentColor" : "none"} />
            </button>
            <button className="btn-ghost h-8 w-8 p-0 text-muted" title="コメント" onClick={() => setCommentsOpen(true)}>
              <MessageSquare size={15} />
            </button>
            {editable && (
              <button className="h-8 px-2.5 text-[13px] text-muted hover:text-ink" onClick={() => setShareOpen(true)}>
                共有
              </button>
            )}
            <button
              className="btn-ghost h-8 w-8 p-0 text-muted"
              onClick={() => setMoreOpen((v) => !v)}
              title="その他"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <div className="menu-panel absolute right-0 top-9 z-20 w-48 p-1" onClick={(e) => e.stopPropagation()}>
                <button
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                  onClick={() => {
                    setMoreOpen(false);
                    void navigator.clipboard.writeText(window.location.href);
                  }}
                >
                  <Link2 size={14} />
                  リンクをコピー
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                  onClick={() => {
                    setMoreOpen(false);
                    setHistoryOpen(true);
                  }}
                >
                  <Clock size={14} />
                  履歴
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                  onClick={async () => {
                    setMoreOpen(false);
                    const d = await api<{ markdown: string; title: string }>(`/api/pages/${pageId}/export`);
                    const blob = new Blob([d.markdown], { type: "text/markdown" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${d.title || "無題"}.md`;
                    a.click();
                  }}
                >
                  <Download size={14} />
                  Markdown
                </button>
                {editable && (
                  <button
                    className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-hover"
                    onClick={() => {
                      setMoreOpen(false);
                      void remove();
                    }}
                  >
                    <Trash2 size={14} />
                    削除
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>
      {page.coverR2Key && (
        <div className="group/cover relative h-48 w-full bg-canvas">
          <img src={`/api/files/${page.coverR2Key}`} alt="" className="h-48 w-full object-cover" />
          {editable && (
            <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover/cover:opacity-100">
              <button
                className="rounded-[6px] bg-white/90 px-2 py-1 text-[12px] text-muted"
                onClick={() => pickCover()}
              >
                カバーを変更
              </button>
              <button
                className="rounded-[6px] bg-white/90 px-2 py-1 text-[12px] text-muted"
                onClick={() => void saveCover(null)}
              >
                カバーを削除
              </button>
            </div>
          )}
        </div>
      )}
      <div
        className={
          page.type === "database" ? "group pb-32" : "group mx-auto max-w-[900px] pb-40"
        }
      >
        <div
          className={`relative px-24 max-[860px]:px-6 ${
            page.coverR2Key
              ? page.icon
                ? "pt-11"
                : "pt-8"
              : page.type === "database"
                ? "pt-12"
                : "pt-20"
          }`}
        >
          {editable && (
            <div
              className={`pointer-events-none absolute z-[3] flex flex-wrap gap-1 ${
                page.icon
                  ? "left-[182px] max-[860px]:left-[110px]"
                  : "left-24 max-[860px]:left-6"
              } ${page.coverR2Key && page.icon ? "top-1" : "top-0"} ${
                iconOpen ? "pointer-events-auto opacity-100" : "opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
              }`}
            >
              {!page.icon && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[14px] text-muted hover:bg-hover"
                  onClick={() => setIconOpen((v) => !v)}
                >
                  <SmilePlus size={15} />
                  アイコンを追加
                </button>
              )}
              {!page.coverR2Key && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[14px] text-muted hover:bg-hover"
                  onClick={() => pickCover()}
                >
                  <ImagePlus size={15} />
                  カバーを追加
                </button>
              )}
              <button
                className="inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[14px] text-muted hover:bg-hover"
                onClick={() => setCommentsOpen(true)}
              >
                <MessageSquare size={15} />
                コメントを追加
              </button>
            </div>
          )}
          {page.icon ? (
            <button
              className={`rounded-xl text-[78px] leading-none transition hover:bg-hover ${
                page.coverR2Key
                  ? "absolute left-24 top-[-42px] z-[2] max-[860px]:left-6"
                  : "mb-1 block"
              }`}
              onClick={() => editable && setIconOpen((v) => !v)}
              disabled={!editable}
            >
              {page.icon}
            </button>
          ) : (
            editable && !page.coverR2Key && <div className="h-8" />
          )}
          {iconOpen && (
            <div
              className={`menu-panel absolute left-24 z-20 w-72 p-2 max-[860px]:left-6 ${
                page.coverR2Key && page.icon ? "top-12" : "top-[5.5rem]"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
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
          <input
            ref={titleRef}
            className="page-title"
            value={title}
            placeholder="無題"
            readOnly={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveTitle(title)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowDown") {
                e.preventDefault();
                void saveTitle(title);
                if (page.type !== "database") {
                  document.querySelector<HTMLElement>(".arcana-doc")?.focus();
                } else {
                  e.currentTarget.blur();
                }
              }
            }}
          />
        </div>
        {page.type === "database" ? (
            <DatabaseView
              pageId={pageId}
              schema={dbSchema}
              views={dbViews}
              rows={children}
              pages={pages}
              members={members}
              editable={editable}
              onOpenRow={setPeekId}
            onChanged={async () => {
              await reloadPage();
              await onPagesChanged();
            }}
          />
        ) : (
          <>
            {parentFields.length > 0 && (
              <div className="mt-4 space-y-0.5 px-24 max-[860px]:px-6">
                {parentFields.map((p) => (
                  <div key={p.id} className="flex min-h-8 items-center gap-4">
                    <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-[13px] text-muted">
                      <PropertyIcon type={p.type} />
                      {p.name}
                    </span>
                    <PropertyValue
                      property={p}
                      value={pageProps[p.id]}
                      editable={editable}
                      members={members}
                      pages={pages}
                      title={title}
                      schema={parentSchema}
                      allProps={pageProps}
                      onChange={(v) => void saveProp(p.id, v)}
                    />
                  </div>
                ))}
              </div>
            )}
            <TiptapEditor
              key={pageId}
              pageId={pageId}
              user={user}
              shareToken={shareToken}
              editable={editable}
              title={title}
              onOpenPage={onOpenPage}
              onPagesChanged={onPagesChanged}
            />
          </>
        )}
      </div>
      {peekRow && (
        <RowPeek
          page={peekRow}
          schema={dbSchema}
          user={user}
          editable={editable}
          shareToken={shareToken}
          onClose={() => setPeekId(null)}
          onOpenPage={() => {
            setPeekId(null);
            onOpenPage(peekRow.id);
          }}
          onChanged={async () => {
            await reloadPage();
            await onPagesChanged();
          }}
          onDelete={async () => {
            await api(`/api/pages/${peekRow.id}`, { method: "DELETE" });
            setPeekId(null);
            await reloadPage();
            await onPagesChanged();
          }}
        />
      )}
      {shareOpen && page && <ShareDialog page={page} onClose={() => setShareOpen(false)} />}
      {commentsOpen && (
        <CommentsPanel pageId={pageId} userId={user.id} onClose={() => setCommentsOpen(false)} />
      )}
      {historyOpen && <HistoryPanel pageId={pageId} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
