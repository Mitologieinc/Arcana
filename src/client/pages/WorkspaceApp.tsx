import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, FilePlus, LayoutGrid, LogOut, Search, Settings } from "lucide-react";
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
  const [members, setMembers] = useState<Member[]>([]);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);
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
    const { data } = await authClient.passkey.listUserPasskeys();
    setPasskeyCount(Array.isArray(data) ? data.length : 0);
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

  const current = useMemo(() => pages.find((p) => p.id === pageId) ?? null, [pages, pageId]);
  const recent = useMemo(
    () =>
      [...pages]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [pages],
  );

  async function createPage(parentId?: string | null, type: "page" | "database" = "page") {
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
      <div className="flex h-full items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="h-10 w-10 rounded-xl" />
          <div className="skeleton h-2 w-16" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white">
      <aside
        className={`flex shrink-0 flex-col bg-sidebar py-2 transition-[width] duration-200 ease-out ${
          collapsed ? "w-[56px] px-1.5" : "w-[252px] px-1.5"
        }`}
      >
        {collapsed ? (
          <button className="mb-2 flex justify-center" onClick={() => nav("/")} title="Arcana WorkSquare">
            <BrandMark className="h-8 w-8 rounded-[8px]" />
          </button>
        ) : (
          <button
            className="mb-2 overflow-hidden rounded-[8px] bg-black px-2 py-1.5"
            onClick={() => nav("/")}
            title="Arcana WorkSquare"
          >
            <BrandLockup className="h-9 w-full object-contain" />
          </button>
        )}
        {!collapsed && (
          <button className="sidebar-item mb-2 h-8 px-2 font-medium" onClick={() => nav("/")} title={workspace.name}>
            <span className="min-w-0 truncate">{workspace.name}</span>
          </button>
        )}
        <button className={`sidebar-item text-muted ${collapsed ? "justify-center px-0" : ""}`} onClick={() => setSearchOpen(true)} title="検索">
          <Search size={15} strokeWidth={1.75} />
          {!collapsed && (
            <>
              検索
              <kbd className="kbd ml-auto">⌘K</kbd>
            </>
          )}
        </button>
        <button
          className={`sidebar-item text-muted ${collapsed ? "justify-center px-0" : ""}`}
          onClick={() => createPage(null, "page")}
          title="新規ページ"
        >
          <FilePlus size={15} strokeWidth={1.75} />
          {!collapsed && "新規ページ"}
        </button>
        <button
          className={`sidebar-item mb-3 text-muted ${collapsed ? "justify-center px-0" : ""}`}
          onClick={() => createPage(null, "database")}
          title="新規データベース"
        >
          <LayoutGrid size={15} strokeWidth={1.75} />
          {!collapsed && "新規データベース"}
        </button>
        {!collapsed && <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted">ページ</div>}
        <div className="sidebar-scroll min-h-0 flex-1 overflow-auto px-0.5 pb-2">
          <SidebarTree
            pages={pages}
            currentId={pageId}
            compact={collapsed}
            onOpen={(id) => nav(`/page/${id}`)}
            onCreateChild={(id) => createPage(id, "page")}
          />
        </div>
        {passkeyCount === 0 && !collapsed && (
          <button className="sidebar-item mb-1 text-[12px] text-muted" onClick={openSettings}>
            パスキーを追加
          </button>
        )}
        <button
          className={`sidebar-item mb-0.5 text-muted ${collapsed ? "justify-center px-0" : ""}`}
          onClick={toggleSidebar}
          title={collapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && "サイドバーを閉じる"}
        </button>
        <div className={`mt-0.5 flex items-center gap-0.5 ${collapsed ? "flex-col" : ""}`}>
          <button
            className={`sidebar-item min-w-0 ${collapsed ? "justify-center px-0" : "flex-1"}`}
            onClick={openSettings}
            title={user.name}
          >
            <Avatar name={user.name} seed={user.id} />
            {!collapsed && (
              <>
                <span className="min-w-0 truncate">{user.name}</span>
                <Settings size={14} className="ml-auto shrink-0 text-muted" />
              </>
            )}
          </button>
          <button
            className="btn-ghost h-[30px] w-[30px] p-0 text-muted"
            title="ログアウト"
            onClick={async () => {
              await authClient.signOut();
              nav("/login");
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
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
          <div className="mx-auto max-w-[720px] px-16 py-24">
            <p className="text-[13px] font-medium text-muted">{greeting()}</p>
            <h1 className="mt-1 text-[40px] font-bold tracking-[-0.03em]">{user.name}</h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
              左のサイドバーからページを開くか、ここから新しく書き始めてください。
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => createPage(null, "page")}>
                <FilePlus size={15} />
                新規ページ
              </button>
              <button className="btn btn-secondary" onClick={() => createPage(null, "database")}>
                <LayoutGrid size={15} />
                新規データベース
              </button>
            </div>
            {recent.length > 0 && (
              <div className="mt-14">
                <p className="mb-2 px-1 text-[12px] font-medium text-muted">ジャンプ</p>
                <ul className="overflow-hidden rounded-[10px] border border-line">
                  {recent.map((p) => (
                    <li key={p.id} className="border-t border-line first:border-t-0">
                      <button
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] hover:bg-hover"
                        onClick={() => nav(`/page/${p.id}`)}
                      >
                        <span className="text-[16px]">{p.icon || (p.type === "database" ? "🗃️" : "📄")}</span>
                        <span className={`min-w-0 flex-1 truncate ${p.title ? "" : "text-muted"}`}>
                          {p.title || "無題"}
                        </span>
                        <span className="shrink-0 text-[12px] text-muted">{relativeTime(p.updatedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
        />
      )}
    </div>
  );
}
