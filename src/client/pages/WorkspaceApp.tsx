import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, FilePlus, LayoutGrid, Plus, Search } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { greeting, relativeTime } from "../lib/format";
import type { Member, Page, User, Workspace } from "../lib/types";
import { SidebarTree } from "../components/SidebarTree";
import { PageEditor } from "../components/PageEditor";
import { SearchModal } from "../components/SearchModal";
import { SettingsPanel } from "../components/SettingsPanel";
import { BrandLockup, BrandMark } from "../components/Brand";
import { Avatar } from "../components/Avatar";

export function WorkspaceApp() {
  const { pageId } = useParams();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("arcana.sidebar") === "1");

  function toggleSidebar() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("arcana.sidebar", next ? "1" : "0");
      return next;
    });
  }

  async function refresh() {
    const me = await api<{ user: User | null; workspace: Workspace | null }>("/api/me");
    if (!me.user || !me.workspace) {
      const boot = await api<{ needsSetup: boolean }>("/api/bootstrap");
      nav(boot.needsSetup ? "/signup" : "/login", { replace: true });
      return false;
    }
    setUser(me.user);
    setWorkspace(me.workspace);
    const list = await api<{ pages: Page[] }>("/api/pages");
    setPages(list.pages);
    return true;
  }

  useEffect(() => {
    refresh().then((ok) => {
      if (ok) setReady(true);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!newOpen) return;
    const close = () => setNewOpen(false);
    const t = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [newOpen]);

  const current = useMemo(() => pages.find((p) => p.id === pageId) ?? null, [pages, pageId]);
  const recent = useMemo(
    () =>
      [...pages]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [pages],
  );

  async function createPage(parentId?: string | null, type: "page" | "database" = "page") {
    setNewOpen(false);
    const res = await api<{ page: Page }>("/api/pages", {
      method: "POST",
      body: JSON.stringify({ parentId: parentId ?? null, type }),
    });
    await refresh();
    nav(`/page/${res.page.id}`);
  }

  async function openSettings() {
    const data = await api<{ members: Member[] }>("/api/members");
    setMembers(data.members);
    setSettingsOpen(true);
  }

  if (!ready || !user || !workspace) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <BrandMark className="h-9 w-9" />
      </div>
    );
  }

  const item = collapsed ? "sidebar-item justify-center px-0" : "sidebar-item";

  return (
    <div className="flex h-full bg-white">
      <aside
        className={`group/sidebar flex shrink-0 flex-col bg-sidebar py-2 transition-[width] duration-200 ease-out ${
          collapsed ? "w-[52px] px-1.5" : "w-[240px] px-2"
        }`}
      >
        <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "gap-1"}`}>
          <button
            className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "flex-1 justify-start px-1 py-0.5"}`}
            onClick={() => nav("/")}
            title="Arcana WorkSquare"
          >
            {collapsed ? (
              <BrandMark className="h-7 w-7" />
            ) : (
              <BrandLockup className="h-8 w-auto max-w-full object-left" />
            )}
          </button>
          {!collapsed && (
            <button
              className="btn-ghost h-7 w-7 p-0 text-muted opacity-0 group-hover/sidebar:opacity-100"
              onClick={toggleSidebar}
              title="サイドバーを閉じる"
            >
              <ChevronsLeft size={15} />
            </button>
          )}
        </div>
        {collapsed && (
          <button className={`${item} mb-1 text-muted`} onClick={toggleSidebar} title="サイドバーを開く">
            <ChevronsRight size={15} />
          </button>
        )}
        <button className={`${item} text-muted`} onClick={() => setSearchOpen(true)} title="検索">
          <Search size={15} strokeWidth={1.6} />
          {!collapsed && (
            <>
              検索
              <kbd className="kbd ml-auto">⌘K</kbd>
            </>
          )}
        </button>
        <div className="relative">
          <button
            className={`${item} mb-2 text-muted`}
            onClick={(e) => {
              e.stopPropagation();
              setNewOpen((v) => !v);
            }}
            title="新規"
          >
            <Plus size={15} strokeWidth={1.6} />
            {!collapsed && "新規"}
          </button>
          {newOpen && (
            <div
              className={`menu-panel absolute z-20 w-44 p-1 ${collapsed ? "left-full top-0 ml-1" : "left-2 right-2 top-8 w-auto"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                onClick={() => createPage(null, "page")}
              >
                <FilePlus size={14} />
                ページ
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                onClick={() => createPage(null, "database")}
              >
                <LayoutGrid size={14} />
                データベース
              </button>
            </div>
          )}
        </div>
        <div className="sidebar-scroll min-h-0 flex-1 overflow-auto">
          <SidebarTree
            pages={pages}
            currentId={pageId}
            compact={collapsed}
            onOpen={(id) => nav(`/page/${id}`)}
            onCreateChild={(id) => createPage(id, "page")}
          />
        </div>
        <button className={`${item} mt-1`} onClick={openSettings} title={user.name}>
          <Avatar name={user.name} seed={user.id} size={20} />
          {!collapsed && <span className="min-w-0 truncate">{user.name}</span>}
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        {pageId ? (
          <PageEditor
            key={pageId}
            pageId={pageId}
            user={user}
            pages={pages}
            fallback={current}
            onPagesChanged={refresh}
            onOpenPage={(id) => nav(id ? `/page/${id}` : "/")}
          />
        ) : (
          <div className="mx-auto max-w-[640px] px-16 py-28">
            <p className="text-[13px] text-muted">{greeting()}、{user.name}</p>
            {recent.length > 0 ? (
              <ul className="mt-10">
                {recent.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center gap-3 rounded-[6px] px-1.5 py-2 text-left text-[14px] hover:bg-hover"
                      onClick={() => nav(`/page/${p.id}`)}
                    >
                      <span className="text-[15px]">{p.icon || (p.type === "database" ? "🗃️" : "📄")}</span>
                      <span className={`min-w-0 flex-1 truncate ${p.title ? "" : "text-muted"}`}>
                        {p.title || "無題"}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">{relativeTime(p.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-10 text-[14px] text-muted">⌘K で探すか、左の ＋ から書いてください。</p>
            )}
          </div>
        )}
      </main>
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onOpen={(id) => {
            setSearchOpen(false);
            nav(`/page/${id}`);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          members={members}
          role={workspace.role}
          onClose={() => {
            setSettingsOpen(false);
            void refresh();
          }}
          onChanged={async () => {
            const data = await api<{ members: Member[] }>("/api/members");
            setMembers(data.members);
          }}
          onSignOut={async () => {
            await authClient.signOut();
            nav("/login");
          }}
        />
      )}
    </div>
  );
}
