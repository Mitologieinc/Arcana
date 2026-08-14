import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LogOut, Plus, Search, Users } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import type { Member, Page, User, Workspace } from "../lib/types";
import { SidebarTree } from "../components/SidebarTree";
import { PageEditor } from "../components/PageEditor";
import { SearchModal } from "../components/SearchModal";
import { MembersPanel } from "../components/MembersPanel";

export function WorkspaceApp() {
  const { pageId } = useParams();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

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

  const current = useMemo(
    () => pages.find((p) => p.id === pageId) ?? null,
    [pages, pageId],
  );

  async function createPage(parentId?: string | null, type: "page" | "database" = "page") {
    const res = await api<{ page: Page }>("/api/pages", {
      method: "POST",
      body: JSON.stringify({ parentId: parentId ?? null, type }),
    });
    await refresh();
    nav(`/page/${res.page.id}`);
  }

  if (!ready || !user || !workspace) {
    return <div className="flex h-full items-center justify-center text-muted">読み込み中…</div>;
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex items-center justify-between px-3 py-3">
          <div>
            <div className="text-sm font-semibold">{workspace.name}</div>
            <div className="text-[11px] text-muted">席課金なし · {user.name}</div>
          </div>
          <button
            title="ログアウト"
            className="rounded p-1 text-muted hover:bg-line"
            onClick={async () => {
              await authClient.signOut();
              nav("/login");
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
        <button
          className="mx-2 mb-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-line"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={14} />
          検索
          <span className="ml-auto text-[10px]">⌘K</span>
        </button>
        <div className="flex gap-1 px-2 pb-2">
          <button
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white px-2 py-1 text-xs hover:bg-line"
            onClick={() => createPage(null, "page")}
          >
            <Plus size={12} />
            ページ
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white px-2 py-1 text-xs hover:bg-line"
            onClick={() => createPage(null, "database")}
          >
            <Plus size={12} />
            DB
          </button>
        </div>
        <div className="flex-1 overflow-auto px-1 pb-3">
          <SidebarTree
            pages={pages}
            currentId={pageId}
            onOpen={(id) => nav(`/page/${id}`)}
            onCreateChild={(id) => createPage(id, "page")}
          />
        </div>
        <button
          className="flex items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-muted hover:bg-line"
          onClick={async () => {
            const data = await api<{ members: Member[] }>("/api/members");
            setMembers(data.members);
            setMembersOpen(true);
          }}
        >
          <Users size={14} />
          メンバー（人数無制限）
        </button>
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
          <div className="mx-auto max-w-2xl px-10 py-20">
            <h1 className="text-3xl font-semibold">ようこそ、{workspace.name}</h1>
            <p className="mt-3 text-muted">
              左のサイドバーからページを開くか、新しいページを作成してください。メンバーは何人でも招待できます。
            </p>
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
      {membersOpen && (
        <MembersPanel
          members={members}
          role={workspace.role}
          onClose={() => setMembersOpen(false)}
          onChanged={async () => {
            const data = await api<{ members: Member[] }>("/api/members");
            setMembers(data.members);
          }}
        />
      )}
    </div>
  );
}
