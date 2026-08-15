import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
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
  const { token } = useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [permission, setPermission] = useState<Permission>("view");
  const [error, setError] = useState("");
  const guest = useMemo<User>(
    () => ({ id: guestId(), name: "ゲスト", email: "" }),
    [],
  );

  useEffect(() => {
    if (!token) return;
    api<{ page: Page | null; permission: Permission }>(`/api/share/${token}`)
      .then((d) => {
        if (!d.page) throw new Error("リンクが無効です");
        setPage(d.page);
        setPermission(d.permission);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "リンクが無効です"));
  }, [token]);

  useLayoutEffect(() => {
    if (page || error) hideBootSplash();
  }, [page, error]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-6 text-center">
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
    <div className={`h-full ${page.type === "canvas" ? "overflow-hidden" : "overflow-auto"}`}>
      <PageEditor
        key={page.id}
        pageId={page.id}
        user={guest}
        shareToken={token}
        fallback={page}
        forcedPermission={permission}
        onPagesChanged={async () => undefined}
        onOpenPage={() => undefined}
      />
    </div>
  );
}
