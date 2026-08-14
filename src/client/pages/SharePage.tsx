import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Page, Permission, User } from "../lib/types";
import { PageEditor } from "../components/PageEditor";

export function SharePage() {
  const { token } = useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [permission, setPermission] = useState<Permission>("view");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api<{ page: Page; permission: Permission }>(`/api/share/${token}`)
      .then((d) => {
        setPage(d.page);
        setPermission(d.permission);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) {
    return <div className="flex h-full items-center justify-center text-red-600">{error}</div>;
  }
  if (!page || !token) {
    return <div className="flex h-full items-center justify-center text-muted">読み込み中…</div>;
  }

  const guest: User = { id: "guest", name: "ゲスト", email: "" };

  return (
    <div className="h-full">
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
