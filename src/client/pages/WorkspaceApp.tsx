import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, CheckSquare, FileText, PanelLeft, Plus, Search, StickyNote } from "lucide-react";
import { CreateMenuPanel, type CreateSeed } from "../components/CreateMenu";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { greeting, modSymbol, pageTypeIcon, relativeTime } from "../lib/format";
import type { Member, Page, PageType, SavedTemplate, User, Workspace } from "../lib/types";
import { AppRail } from "../components/AppRail";
import { SidebarTree } from "../components/SidebarTree";
import { PageEditor } from "../components/PageEditor";
import { PageIcon } from "../components/PageIcon";
import { SearchModal } from "../components/SearchModal";
import { SettingsPanel } from "../components/SettingsPanel";
import { TrashPanel } from "../components/TrashPanel";
import { NotifPanel } from "../components/NotifPanel";
import { hideBootSplash } from "../components/Brand";
import { useIsMobile } from "../lib/media";

export function WorkspaceApp() {
  const { pageId } = useParams();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [navOpen, setNavOpen] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches
      ? false
      : localStorage.getItem("arcana.sidebar") === "0",
  );
  const [trashOpen, setTrashOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [favorites, setFavorites] = useState<Page[]>([]);
  const [unread, setUnread] = useState(0);
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  function toggleNav() {
    setNavOpen((v) => {
      const next = !v;
      if (!window.matchMedia("(max-width: 720px)").matches) {
        localStorage.setItem("arcana.sidebar", next ? "0" : "1");
      }
      return next;
    });
  }

  function closeNavIfMobile() {
    if (window.matchMedia("(max-width: 720px)").matches) setNavOpen(false);
  }

  function openPage(id: string) {
    closeNavIfMobile();
    nav(`/page/${id}`);
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
    const tpls = await api<{ templates: SavedTemplate[] }>("/api/templates").catch(() => ({
      templates: [] as SavedTemplate[],
    }));
    setTemplates(tpls.templates);
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

  function createFromMenu(seed: CreateSeed) {
    void createPage(null, seed.type, seed);
  }

  async function createPage(
    parentId?: string | null,
    type: PageType = "page",
    seed?: { title?: string; icon?: string; templateId?: string },
  ) {
    const res = await api<{ page: Page }>("/api/pages", {
      method: "POST",
      body: JSON.stringify({
        parentId: parentId ?? null,
        type,
        title: seed?.title,
        icon: seed?.icon,
        templateId: seed?.templateId,
      }),
    });
    await refresh();
    closeNavIfMobile();
    nav(`/page/${res.page.id}`, { state: { focusTitle: !seed?.title && !seed?.templateId } });
  }

  async function openSettings() {
    const data = await api<{ members: Member[] }>("/api/members");
    setMembers(data.members);
    setSettingsOpen(true);
  }

  useEffect(() => {
    if (isMobile) setNavOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!createOpen) return;
    const close = () => setCreateOpen(false);
    const t = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [createOpen]);

  useLayoutEffect(() => {
    if (ready) hideBootSplash();
  }, [ready]);

  if (!ready || !user || !workspace) return null;

  return (
    <div className="arcana-shell">
      <AppRail
        user={user}
        home={!pageId}
        navOpen={navOpen}
        unread={unread}
        templates={templates}
        onHome={() => {
          closeNavIfMobile();
          nav("/");
        }}
        onSearch={() => setSearchOpen(true)}
        onToggleNav={toggleNav}
        onCreate={createFromMenu}
        onSettings={() => void openSettings()}
        onTrash={() => setTrashOpen(true)}
        onNotifs={() => setNotifOpen(true)}
      />
      {navOpen && isMobile && (
        <button className="arcana-nav-backdrop" onClick={toggleNav} aria-label="メニューを閉じる" />
      )}
      <aside className={`arcana-nav ${navOpen ? "" : "is-collapsed"}`} aria-hidden={!navOpen}>
          <div className="flex h-11 items-center justify-between px-3">
            <div className="flex min-w-0 items-center gap-1">
              <button
                className="btn-ghost h-7 w-7 p-0 text-muted"
                onClick={toggleNav}
                title="サイドバーを閉じる"
              >
                <PanelLeft size={15} strokeWidth={1.6} />
              </button>
              <span className="min-w-0 truncate text-[13px] font-medium">{workspace.name}</span>
            </div>
            <div className="relative">
              <button
                className="btn-ghost h-7 w-7 p-0 text-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateOpen((v) => !v);
                }}
                title="新規"
              >
                <Plus size={15} strokeWidth={1.6} />
              </button>
              {createOpen && (
                <div
                  className="menu-panel absolute right-0 top-8 z-30 w-56"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CreateMenuPanel
                    templates={templates}
                    onPick={(seed) => {
                      setCreateOpen(false);
                      createFromMenu(seed);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="mx-2 mb-2 flex h-8 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] text-muted hover:bg-hover"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={14} strokeWidth={1.6} />
            <span className="flex-1">検索</span>
            <kbd className="kbd">{modSymbol()}K</kbd>
          </button>
          {favorites.length > 0 && (
            <div className="mb-2 px-2">
              <p className="px-2 pb-1 text-[11px] font-medium text-muted">お気に入り</p>
              {favorites.map((p) => (
                <button
                  key={p.id}
                  className="flex h-[30px] w-full items-center gap-1.5 rounded-[6px] px-2 text-left text-[13px] hover:bg-hover"
                  onClick={() => openPage(p.id)}
                >
                  <PageIcon icon={p.icon} fallback="⭐" size={15} />
                  <span className="min-w-0 truncate">{p.title || "無題"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="sidebar-scroll min-h-0 flex-1 overflow-auto px-2 pb-3">
            <SidebarTree
              pages={pages}
              currentId={pageId}
              onOpen={openPage}
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
      <main className={`relative min-w-0 flex-1 ${current?.type === "canvas" ? "overflow-hidden" : "overflow-auto"}`}>
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
            onOpenPage={(id) => (id ? openPage(id) : nav("/"))}
            canSaveTemplate={workspace.role !== "guest"}
          />
        ) : (
          <Home
            userName={user.name}
            favorites={favorites}
            recent={recent}
            templates={templates}
            showMenu
            onMenu={toggleNav}
            onSearch={() => setSearchOpen(true)}
            onOpen={openPage}
            onMemo={() => void createPage(null, "page", { title: "メモ", icon: "📝" })}
            onMeeting={() => void createPage(null, "page", { title: "会議メモ", icon: "📅" })}
            onTasks={() => void createPage(null, "database", { title: "タスク", icon: "✅" })}
            onCanvas={() => void createPage(null, "canvas", { title: "キャンバス", icon: "🎨" })}
            onTemplate={(t) =>
              void createPage(null, "page", { title: t.title || t.name, icon: t.icon || "📄", templateId: t.id })
            }
          />
        )}
      </main>
      {searchOpen && (
        <SearchModal
          pages={pages}
          onClose={() => setSearchOpen(false)}
          onOpen={(id) => {
            setSearchOpen(false);
            openPage(id);
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
            openPage(id);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          user={user}
          members={members}
          workspace={workspace}
          role={workspace.role}
          onClose={() => {
            setSettingsOpen(false);
            void refresh();
          }}
          onChanged={async () => {
            await refresh();
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

function Home({
  userName,
  favorites,
  recent,
  templates,
  showMenu,
  onMenu,
  onSearch,
  onOpen,
  onMemo,
  onMeeting,
  onTasks,
  onCanvas,
  onTemplate,
}: {
  userName: string;
  favorites: Page[];
  recent: Page[];
  templates: SavedTemplate[];
  showMenu?: boolean;
  onMenu?: () => void;
  onSearch: () => void;
  onOpen: (id: string) => void;
  onMemo: () => void;
  onMeeting: () => void;
  onTasks: () => void;
  onCanvas: () => void;
  onTemplate: (t: SavedTemplate) => void;
}) {
  const favIds = new Set(favorites.map((p) => p.id));
  const continuePages = recent.filter((p) => !favIds.has(p.id)).slice(0, 8);
  const empty = favorites.length === 0 && recent.length === 0;

  return (
    <>
      {showMenu && onMenu && (
        <div className="sticky top-0 z-[5] hidden h-11 items-center gap-2 bg-white/75 px-3 backdrop-blur-md max-[720px]:flex">
          <button className="btn-ghost h-9 w-9 p-0 text-muted" onClick={onMenu} title="ページ一覧">
            <PanelLeft size={18} strokeWidth={1.6} />
          </button>
          <span className="text-[14px] font-medium">ホーム</span>
        </div>
      )}
    <div className="mx-auto max-w-[640px] px-10 py-16 max-[720px]:px-4 max-[720px]:py-6">
      <button
        className="flex h-11 w-full items-center gap-3 rounded-full border border-line bg-white px-4 text-left text-[14px] text-muted hover:bg-canvas"
        onClick={onSearch}
      >
        <Search size={16} strokeWidth={1.6} />
        <span className="flex-1">検索</span>
        <kbd className="kbd">{modSymbol()}K</kbd>
      </button>
      <h1 className="mt-12 text-[22px] font-medium tracking-tight max-[720px]:mt-6">
        {greeting()}、{userName}
      </h1>
      <section className="mt-8">
        <p className="mb-3 text-[13px] text-muted">{empty ? "どれかから書き始めてください。" : "新しく作る"}</p>
        <div className="grid grid-cols-4 gap-2 max-[640px]:grid-cols-2">
          <StartCard icon={<FileText size={18} strokeWidth={1.6} />} label="メモ" hint="短い記録" onClick={onMemo} />
          <StartCard icon={<Calendar size={18} strokeWidth={1.6} />} label="会議メモ" hint="議事と次の行動" onClick={onMeeting} />
          <StartCard icon={<CheckSquare size={18} strokeWidth={1.6} />} label="タスク" hint="データベース" onClick={onTasks} />
          <StartCard icon={<StickyNote size={18} strokeWidth={1.6} />} label="キャンバス" hint="付箋と図" onClick={onCanvas} />
          {templates.map((t) => (
            <StartCard
              key={t.id}
              icon={<span className="text-[18px] leading-none">{t.icon || "📄"}</span>}
              label={t.name}
              hint="テンプレート"
              onClick={() => onTemplate(t)}
            />
          ))}
        </div>
      </section>
      {favorites.length > 0 && (
        <section className="mt-8">
          <p className="mb-2 px-1.5 text-[11px] font-medium text-muted">お気に入り</p>
          <ul>
            {favorites.map((p) => (
              <HomeRow key={p.id} page={p} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
      {continuePages.length > 0 && (
        <section className="mt-6">
          <p className="mb-2 px-1.5 text-[11px] font-medium text-muted">最近</p>
          <ul>
            {continuePages.map((p) => (
              <HomeRow key={p.id} page={p} onOpen={onOpen} showTime />
            ))}
          </ul>
        </section>
      )}
    </div>
    </>
  );
}

function StartCard({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-[10px] border border-line px-3 py-3 text-left hover:bg-hover"
      onClick={onClick}
    >
      <span className="text-muted">{icon}</span>
      <span className="mt-2 block text-[14px] font-medium">{label}</span>
      <span className="mt-0.5 block text-[12px] text-muted">{hint}</span>
    </button>
  );
}

function HomeRow({
  page,
  onOpen,
  showTime,
}: {
  page: Page;
  onOpen: (id: string) => void;
  showTime?: boolean;
}) {
  return (
    <li>
      <button
        className="flex w-full items-center gap-3 rounded-[8px] px-1.5 py-2.5 text-left text-[14px] hover:bg-hover"
        onClick={() => onOpen(page.id)}
      >
        <PageIcon icon={page.icon} fallback={pageTypeIcon(page.type)} size={15} />
        <span className={`min-w-0 flex-1 truncate ${page.title ? "" : "text-muted"}`}>
          {page.title || "無題"}
        </span>
        {showTime && <span className="shrink-0 text-[12px] text-muted">{relativeTime(page.updatedAt)}</span>}
      </button>
    </li>
  );
}
