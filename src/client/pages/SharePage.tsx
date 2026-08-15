import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import type { Page, Permission, User } from "../lib/types";
import { PageEditor } from "../components/PageEditor";
import { BrandLockup, hideBootSplash } from "../components/Brand";

function guestId() {
  const key = "arcana.guest";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return "guest";
  }
}

export function SharePage() {
  const { token, pageId: routePageId } = useParams();
  const nav = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [permission, setPermission] = useState<Permission>("view");
  const [error, setError] = useState("");
  const opened = useRef(false);
  const guest = useMemo<User>(
    () => ({ id: guestId(), name: "ゲスト", email: "" }),
    [],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const id = routePageId;
        if (id) {
          const d = await api<{ page: Page; permission: Permission; ancestors?: Page[] }>(
            `/api/pages/${id}?token=${encodeURIComponent(token!)}`,
          );
          if (cancelled) return;
          setPage(d.page);
          setPermission(d.permission);
          setPages([...(d.ancestors ?? []), d.page]);
          setError("");
          opened.current = true;
          return;
        }
        const shared = await api<{ page: Page; permission: Permission }>(`/api/share/${token}`);
        if (!shared.page) throw new Error("リンクが無効です");
        const d = await api<{ page: Page; ancestors?: Page[] }>(
          `/api/pages/${shared.page.id}?token=${encodeURIComponent(token!)}`,
        ).catch(() => ({ page: shared.page, ancestors: [] as Page[] }));
        if (cancelled) return;
        setPage(d.page);
        setPermission(shared.permission);
        setPages([...(d.ancestors ?? []), d.page]);
        setError("");
        opened.current = true;
      } catch (e) {
        if (cancelled) return;
        if (opened.current) {
          toast("このページは開けません");
          return;
        }
        setError(e instanceof Error ? e.message : "リンクが無効です");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, routePageId]);

  useLayoutEffect(() => {
    if (page || error) hideBootSplash();
  }, [page, error]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <BrandLockup className="h-12 w-auto" />
        <h1 className="mt-6 text-[15px] font-medium">このリンクは開けません</h1>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-muted">
          無効か、公開が止められています。共有した人に新しいリンクを聞いてください。
        </p>
      </div>
    );
  }
  if (!page || !token) return null;

  return (
    <div className={`h-full bg-canvas ${page.type === "canvas" ? "overflow-hidden" : "overflow-auto"}`}>
      <PageEditor
        key={page.id}
        pageId={page.id}
        user={guest}
        shareToken={token}
        pages={pages}
        fallback={page}
        forcedPermission={permission}
        onPagesChanged={async () => undefined}
        onOpenPage={(id) => {
          if (!id) {
            nav(`/share/${token}`);
            return;
          }
          if (id === page.id) return;
          nav(`/share/${token}/${id}`);
        }}
      />
    </div>
  );
}
