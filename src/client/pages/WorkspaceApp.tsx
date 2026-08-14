import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Fingerprint, LogOut, Plus, Search, Settings } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import type { Member, Page, User, Workspace } from "../lib/types";
import { SidebarTree } from "../components/SidebarTree";
import { PageEditor } from "../components/PageEditor";
import { SearchModal } from "../components/SearchModal";
import { SettingsPanel } from "../components/SettingsPanel";
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
  const [passkeyCount, setPasskeyCount] = useState<number | null>(null);

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
      <div className="flex h-full items-center justify-center bg-canvas text-[13px] text-muted">
        Loading
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <BrandMark />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight">{workspace.name}</div>
            <div className="text-[11px] text-muted">Unlimited seats</div>
          </div>
        </div>
        <button
          className="mx-3 mb-3 flex h-9 items-center gap-2 border border-line bg-white px-3 text-left text-[13px] text-muted"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={14} />
          検索
          <span className="ml-auto font-mono text-[10px] text-muted/80">⌘K</span>
        </button>
        <div className="flex gap-1 px-3 pb-3">
          <button className="btn btn-secondary h-8 flex-1 px-2 text-[12px]" onClick={() => createPage(null, "page")}>
            <Plus size={12} />
            ページ
          </button>
          <button className="btn btn-secondary h-8 flex-1 px-2 text-[12px]" onClick={() => createPage(null, "database")}>
            <Plus size={12} />
            DB
          </button>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-3">
          <SidebarTree
            pages={pages}
            currentId={pageId}
            onOpen={(id) => nav(`/page/${id}`)}
            onCreateChild={(id) => createPage(id, "page")}
          />
        </div>
        {passkeyCount === 0 && (
          <button
            className="mx-3 mb-2 flex items-start gap-2 border border-cf/30 bg-[#fff7f0] px-3 py-2 text-left text-[12px]"
            onClick={openSettings}
          >
            <Fingerprint size={14} className="mt-0.5 text-cf" />
            <span>
              <span className="font-semibold">パスキーを追加</span>
              <span className="mt-0.5 block text-muted">パスワードなしでログイン</span>
            </span>
          </button>
        )}
        <div className="flex items-center border-t border-line px-2 py-2">
          <button className="btn-ghost flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left" onClick={openSettings}>
            <Settings size={14} className="text-muted" />
            <span className="min-w-0 truncate text-[12px]">{user.name}</span>
          </button>
          <button
            className="btn-ghost p-2 text-muted"
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
            fallback={current}
            onPagesChanged={refresh}
            onOpenPage={(id) => nav(id ? `/page/${id}` : "/")}
          />
        ) : (
          <div className="mx-auto max-w-xl px-10 py-24">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cf">Workspace</p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-tight">{workspace.name}</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              左からページを開くか、新しく作成してください。メンバー数に上限はありません。
            </p>
            <div className="mt-6 flex gap-2">
              <button className="btn btn-primary" onClick={() => createPage(null, "page")}>
                ページを作成
              </button>
              <button className="btn btn-secondary" onClick={() => createPage(null, "database")}>
                データベース
              </button>
            </div>
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
