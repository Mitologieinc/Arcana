import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, CheckSquare, FileText, PanelLeft, Plus, Search, StickyNote } from "lucide-react";
import { CreateMenuPanel, type CreateSeed } from "../components/CreateMenu";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { greeting, modSymbol, pageTypeIcon, relativeTime } from "../lib/format";
import { CoverVisual } from "../lib/covers";
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
import { Tooltip } from "../components/Tooltip";

export function WorkspaceApp() {
  const { pageId } = useParams();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const mainRef = useRef<HTMLElement>(null);
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
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    nav(`/page/${id}`);
  }

  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pageId]);

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
          {favorites.length > 0 && (
            <div className="arcana-favs" aria-label="お気に入り">
              {favorites.slice(0, 12).map((p) => (
                <Tooltip key={p.id} label={p.title || "無題"}>
                  <button
                    type="button"
                    className={`arcana-fav ${pageId === p.id ? "is-on" : ""}`}
                    aria-label={p.title || "無題"}
                    onClick={() => openPage(p.id)}
                  >
                    <PageIcon icon={p.icon} fallback={pageTypeIcon(p.type)} size={20} />
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
          <div className="arcana-nav-search">
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[13px] text-muted hover:bg-hover"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={14} strokeWidth={1.6} />
              <span className="min-w-0 flex-1">検索</span>
              <kbd className="kbd">{modSymbol()}K</kbd>
            </button>
          </div>
          <div className="sidebar-scroll min-h-0 flex-1 overflow-auto px-2 pb-3">
            <SidebarTree
              pages={pages}
              currentId={pageId}
              onOpen={openPage}
              onCreateChild={(id) => createPage(id, "page")}
              onCreateRoot={() => void createPage(null, "page")}
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
      <main
        ref={mainRef}
        className={`relative min-w-0 flex-1 ${current?.type === "canvas" ? "overflow-hidden" : "overflow-auto"}`}
      >
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
            workspaceName={workspace.name}
            userName={user.name}
            pages={pages}
            favorites={favorites}
            recent={recent}
            templates={templates}
            canWrite={workspace.role !== "guest"}
            unread={unread}
            showMenu
            onMenu={toggleNav}
            onNotifs={() => setNotifOpen(true)}
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

function pageKind(type: PageType) {
  if (type === "database") return "データベース";
  if (type === "canvas") return "キャンバス";
  return "ページ";
}

function Home({
  workspaceName,
  userName,
  pages,
  favorites,
  recent,
  templates,
  canWrite,
  unread = 0,
  showMenu,
  onMenu,
  onNotifs,
  onSearch,
  onOpen,
  onMemo,
  onMeeting,
  onTasks,
  onCanvas,
  onTemplate,
}: {
  workspaceName: string;
  userName: string;
  pages: Page[];
  favorites: Page[];
  recent: Page[];
  templates: SavedTemplate[];
  canWrite?: boolean;
  unread?: number;
  showMenu?: boolean;
  onMenu?: () => void;
  onNotifs?: () => void;
  onSearch: () => void;
  onOpen: (id: string) => void;
  onMemo: () => void;
  onMeeting: () => void;
  onTasks: () => void;
  onCanvas: () => void;
  onTemplate: (t: SavedTemplate) => void;
}) {
  const roots = useMemo(
    () => pages.filter((p) => !p.parentId).sort((a, b) => a.position - b.position),
    [pages],
  );
  const featured = roots[0] ?? null;
  const showHero = Boolean(featured && (featured.coverR2Key || (featured.title && featured.title !== "無題")));
  const databases = useMemo(
    () => pages.filter((p) => p.type === "database").sort((a, b) => a.position - b.position).slice(0, 8),
    [pages],
  );
  const continuePages = recent.slice(0, 10);

  return (
    <>
      {showMenu && onMenu && (
        <div className="sticky top-0 z-[5] hidden h-11 items-center gap-2 border-b border-line bg-canvas px-3 max-[720px]:flex">
          <button className="btn-ghost h-9 w-9 p-0 text-muted" onClick={onMenu} title="ページ一覧">
            <PanelLeft size={18} strokeWidth={1.6} />
          </button>
          <span className="text-[14px] font-medium">ホーム</span>
        </div>
      )}
      <div className="arcana-home">
        <header className="arcana-home-head">
          <div>
            <h1 className="arcana-home-title">{workspaceName}</h1>
            <p className="arcana-home-kicker">
              {greeting()}、{userName}
              {pages.length > 0 && <span> · {pages.length} ページ</span>}
              {unread > 0 && onNotifs && (
                <button type="button" className="arcana-home-unread" onClick={onNotifs}>
                  未読 {unread}
                </button>
              )}
            </p>
          </div>
          <button type="button" className="arcana-home-search" onClick={onSearch}>
            <Search size={16} strokeWidth={1.6} />
            <span>ページを探す</span>
            <kbd className="kbd">{modSymbol()}K</kbd>
          </button>
          {canWrite && (
            <div className="arcana-home-starts">
              <button type="button" onClick={onMemo}>
                <FileText size={15} strokeWidth={1.6} />
                メモ
              </button>
              <button type="button" onClick={onMeeting}>
                <Calendar size={15} strokeWidth={1.6} />
                会議
              </button>
              <button type="button" onClick={onTasks}>
                <CheckSquare size={15} strokeWidth={1.6} />
                タスク
              </button>
              <button type="button" onClick={onCanvas}>
                <StickyNote size={15} strokeWidth={1.6} />
                キャンバス
              </button>
              {templates.map((t) => (
                <button type="button" key={t.id} onClick={() => onTemplate(t)}>
                  <span>{t.icon || "📄"}</span>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </header>

        {favorites.length > 0 && (
          <section className="arcana-home-section">
            <p className="arcana-home-label">お気に入り</p>
            <ul>
              {favorites.map((p) => (
                <HomeRow key={p.id} page={p} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}

        {continuePages.length > 0 && (
          <section className="arcana-home-section">
            <p className="arcana-home-label">続ける</p>
            <ul>
              {continuePages.map((p) => (
                <HomeRow key={p.id} page={p} onOpen={onOpen} showTime />
              ))}
            </ul>
          </section>
        )}

        {databases.length > 0 && (
          <section className="arcana-home-section">
            <p className="arcana-home-label">データベース</p>
            <ul>
              {databases.map((p) => (
                <HomeRow key={p.id} page={p} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}

        {showHero && featured && (
          <section className="arcana-home-section">
            <p className="arcana-home-label">入り口</p>
            <button type="button" className="arcana-home-hero" onClick={() => onOpen(featured.id)}>
              {featured.coverR2Key ? (
                <CoverVisual cover={featured.coverR2Key} className="arcana-home-hero-cover" />
              ) : (
                <div className="arcana-home-hero-cover is-plain" />
              )}
              <span className="arcana-home-hero-body">
                <PageIcon icon={featured.icon} fallback={pageTypeIcon(featured.type)} size={22} />
                <span className="arcana-home-hero-copy">
                  <span className={`arcana-home-hero-name ${featured.title ? "" : "is-empty"}`}>
                    {featured.title || "無題"}
                  </span>
                  <span className="arcana-home-hero-meta">{pageKind(featured.type)}</span>
                </span>
              </span>
            </button>
          </section>
        )}

        {roots.length > 0 && (
          <section className="arcana-home-section">
            <p className="arcana-home-label">トップ</p>
            <ul>
              {roots.slice(0, 12).map((p) => (
                <HomeRow key={p.id} page={p} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
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
        className="arcana-home-row"
        onClick={() => onOpen(page.id)}
      >
        <PageIcon icon={page.icon} fallback={pageTypeIcon(page.type)} size={15} />
        <span className={`min-w-0 flex-1 truncate ${page.title ? "" : "text-muted"}`}>
          {page.title || "無題"}
        </span>
        <span className="arcana-home-row-meta">
          {pageKind(page.type)}
          {showTime ? ` · ${relativeTime(page.updatedAt)}` : ""}
        </span>
      </button>
    </li>
  );
}
