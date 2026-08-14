import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LogOut, Plus, Search, Settings } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import type { Member, Page, User, Workspace } from "../lib/types";
import { SidebarTree } from "../components/SidebarTree";
import { PageEditor } from "../components/PageEditor";
import { SearchModal } from "../components/SearchModal";
import { SettingsPanel } from "../components/SettingsPanel";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const s = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (s || name.slice(0, 1) || "?").toUpperCase();
}

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
      <div className="flex h-full items-center justify-center bg-white text-[14px] text-muted">読み込み中…</div>
    );
  }

  return (
    <div className="flex h-full bg-white">
      <aside className="flex w-[240px] shrink-0 flex-col bg-sidebar px-1.5 py-2">
        <button
          className="sidebar-item mb-1.5 h-10 px-2 font-medium"
          onClick={() => nav("/")}
          title={workspace.name}
        >
          <span className="cf-mark" style={{ width: 22, height: 22, fontSize: 12 }}>
            {workspace.name.slice(0, 1)}
          </span>
          <span className="min-w-0 truncate">{workspace.name}</span>
        </button>
        <button className="sidebar-item text-muted" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          検索
          <span className="ml-auto text-[11px] text-[#c4c2bc]">⌘K</span>
        </button>
        <button className="sidebar-item text-muted" onClick={() => createPage(null, "page")}>
          <Plus size={16} />
          新規ページ
        </button>
        <button className="sidebar-item mb-2 text-muted" onClick={() => createPage(null, "database")}>
          <Plus size={16} />
          新規データベース
        </button>
        <div className="mb-1 px-2 pt-1 text-[11px] font-medium text-muted">ページ</div>
        <div className="flex-1 overflow-auto px-0.5 pb-2">
          <SidebarTree
            pages={pages}
            currentId={pageId}
            onOpen={(id) => nav(`/page/${id}`)}
            onCreateChild={(id) => createPage(id, "page")}
          />
        </div>
        {passkeyCount === 0 && (
          <button className="sidebar-item mb-1 text-[12px] text-muted" onClick={openSettings}>
            パスキーを追加
          </button>
        )}
        <div className="flex items-center gap-0.5 pb-1">
          <button className="sidebar-item min-w-0 flex-1" onClick={openSettings}>
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#d3e5ef] text-[10px] font-semibold text-[#37352f]">
              {initials(user.name)}
            </span>
            <span className="min-w-0 truncate">{user.name}</span>
            <Settings size={14} className="ml-auto shrink-0 text-muted" />
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
          <div className="mx-auto max-w-2xl px-16 py-28">
            <p className="text-[32px] font-bold tracking-tight">こんにちは、{user.name}</p>
            <p className="mt-2 text-[16px] text-muted">左のサイドバーからページを開くか、新しく書き始めてください。</p>
            <div className="mt-8 flex flex-wrap gap-2">
              <button className="btn btn-secondary" onClick={() => createPage(null, "page")}>
                <Plus size={16} />
                新規ページ
              </button>
              <button className="btn btn-secondary" onClick={() => createPage(null, "database")}>
                <Plus size={16} />
                新規データベース
              </button>
            </div>
            {pages.length > 0 && (
              <div className="mt-12">
                <p className="mb-2 text-[12px] font-medium text-muted">ジャンプ</p>
                <ul>
                  {pages
                    .filter((p) => !p.parentId)
                    .slice(0, 8)
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[14px] hover:bg-hover"
                          onClick={() => nav(`/page/${p.id}`)}
                        >
                          <span>{p.icon || (p.type === "database" ? "🗃️" : "📄")}</span>
                          <span className="truncate">{p.title || "無題"}</span>
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
