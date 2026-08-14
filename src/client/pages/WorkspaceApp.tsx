import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { greeting, relativeTime } from "../lib/format";
import type { Member, Page, User, Workspace } from "../lib/types";
import { AppRail } from "../components/AppRail";
import { SidebarTree } from "../components/SidebarTree";
import { PageEditor } from "../components/PageEditor";
import { SearchModal } from "../components/SearchModal";
import { SettingsPanel } from "../components/SettingsPanel";
import { TrashPanel } from "../components/TrashPanel";
import { NotifPanel } from "../components/NotifPanel";
import { BrandMark } from "../components/Brand";

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
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem("arcana.sidebar") === "0");
  const [trashOpen, setTrashOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [favorites, setFavorites] = useState<Page[]>([]);
  const [unread, setUnread] = useState(0);

  function toggleNav() {
    setNavOpen((v) => {
      const next = !v;
      localStorage.setItem("arcana.sidebar", next ? "0" : "1");
      return next;
    });
  }

  async function refresh() {
    const me = await api<{ user: User | null; workspace: Workspace | null }>("/api/me");
    if (!me.user || !me.workspace) {
      const boot = await api<{ needsSetup: boolean }>("/api/bootstrap");
      nav(boot.needsSetup ? "/setup" : "/login", { replace: true });
      return false;
    }
    setUser(me.user);
    setWorkspace(me.workspace);
    const list = await api<{ pages: Page[] }>("/api/pages");
    setPages(list.pages);
    const fav = await api<{ pages: Page[] }>("/api/favorites").catch(() => ({ pages: [] as Page[] }));
    setFavorites(fav.pages);
    const notes = await api<{ unread: number }>("/api/notifications").catch(() => ({ unread: 0 }));
    setUnread(notes.unread);
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
      if ((e.metaKey || e.ctrlKey) && (e.key === "\\" || e.key === "¥")) {
        e.preventDefault();
        toggleNav();
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
    nav(`/page/${res.page.id}`, { state: { focusTitle: true } });
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

  return (
    <div className="flex h-full bg-white">
      <AppRail
        user={user}
        home={!pageId}
        navOpen={navOpen}
        unread={unread}
        onHome={() => nav("/")}
        onSearch={() => setSearchOpen(true)}
        onToggleNav={toggleNav}
        onNewPage={() => void createPage(null, "page")}
        onSettings={() => void openSettings()}
        onTrash={() => setTrashOpen(true)}
        onNotifs={() => setNotifOpen(true)}
      />
      {navOpen && (
        <aside className="arcana-nav">
          <div className="flex h-11 items-center justify-between px-3">
            <span className="text-[12px] font-medium tracking-wide text-muted">ページ</span>
            <button className="btn-ghost h-7 w-7 p-0 text-muted" onClick={() => void createPage(null, "page")} title="新規ページ">
              <Plus size={15} strokeWidth={1.6} />
            </button>
          </div>
          {favorites.length > 0 && (
            <div className="mb-2 px-2">
              <p className="px-2 pb-1 text-[11px] font-medium text-muted">お気に入り</p>
              {favorites.map((p) => (
                <button
                  key={p.id}
                  className="flex h-[30px] w-full items-center gap-1.5 rounded-[6px] px-2 text-left text-[13px] hover:bg-hover"
                  onClick={() => nav(`/page/${p.id}`)}
                >
                  <span>{p.icon || "⭐"}</span>
                  <span className="min-w-0 truncate">{p.title || "無題"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="sidebar-scroll min-h-0 flex-1 overflow-auto px-2 pb-3">
            <SidebarTree
              pages={pages}
              currentId={pageId}
              onOpen={(id) => nav(`/page/${id}`)}
              onCreateChild={(id) => createPage(id, "page")}
              onMove={async (id, parentId, position) => {
                await api(`/api/pages/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ parentId, position }),
                });
                await refresh();
              }}
            />
          </div>
        </aside>
      )}
      <main className="relative min-w-0 flex-1 overflow-auto">
        {pageId ? (
          <PageEditor
            key={pageId}
            pageId={pageId}
            user={user}
            pages={pages}
            fallback={current}
            sidebarCollapsed={!navOpen}
            onExpandSidebar={toggleNav}
            onPagesChanged={refresh}
            onOpenPage={(id) => nav(id ? `/page/${id}` : "/")}
          />
        ) : (
          <div className="mx-auto max-w-[720px] px-10 py-20">
            <button
              className="flex h-11 w-full items-center gap-3 rounded-full border border-line bg-white px-4 text-left text-[14px] text-muted shadow-[0_1px_2px_rgba(15,15,15,0.04)] hover:bg-canvas"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} strokeWidth={1.6} />
              <span className="flex-1">検索</span>
              <kbd className="kbd">⌘K</kbd>
            </button>
            <p className="mt-10 text-[13px] text-muted">
              {greeting()}、{user.name}
            </p>
            {recent.length > 0 ? (
              <ul className="mt-6">
                {recent.map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full items-center gap-3 rounded-[8px] px-1.5 py-2 text-left text-[14px] hover:bg-hover"
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
              <p className="mt-8 text-[14px] text-muted">⌘K で探すか、左の ＋ から書いてください。</p>
            )}
          </div>
        )}
      </main>
      {searchOpen && (
        <SearchModal
          pages={pages}
          onClose={() => setSearchOpen(false)}
          onOpen={(id) => {
            setSearchOpen(false);
            nav(`/page/${id}`);
          }}
          onCreate={(type) => {
            setSearchOpen(false);
            void createPage(null, type);
          }}
        />
      )}
      {trashOpen && (
        <TrashPanel
          onClose={() => setTrashOpen(false)}
          onChanged={refresh}
        />
      )}
      {notifOpen && (
        <NotifPanel
          onClose={() => {
            setNotifOpen(false);
            void refresh();
          }}
          onOpen={(id) => {
            setNotifOpen(false);
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
