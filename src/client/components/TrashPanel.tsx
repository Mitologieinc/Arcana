import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Page } from "../lib/types";
import { relativeTime } from "../lib/format";
import { SideSheet } from "./SideSheet";
import { PageIcon } from "./PageIcon";
import { ConfirmModal } from "./ConfirmModal";

export function TrashPanel({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [pages, setPages] = useState<Page[]>([]);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  async function load() {
    const d = await api<{ pages: Page[] }>("/api/trash");
    setPages(d.pages);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  return (
    <SideSheet title="ゴミ箱" onClose={onClose}>
      <div className="px-2 py-2 pb-8">
        {pages.length === 0 && <p className="px-2 py-6 text-[13px] text-muted">空です</p>}
        {pages.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-[8px] px-2 py-2 hover:bg-hover">
            <PageIcon icon={p.icon} size={15} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px]">{p.title || "無題"}</p>
              <p className="text-[11px] text-muted">{relativeTime(p.archivedAt ?? p.updatedAt)}</p>
            </div>
            <button
              className="h-7 shrink-0 rounded-md px-2 text-[12px] text-muted hover:bg-hover"
              onClick={async () => {
                await api(`/api/pages/${p.id}/restore`, { method: "POST" });
                await load();
                await onChanged();
              }}
            >
              復元
            </button>
            <button
              className="btn-ghost h-7 w-7 shrink-0 p-0 text-danger"
              title="完全削除"
              onClick={() => setPurgeId(p.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      {purgeId && (
        <ConfirmModal
          title="完全に削除"
          body="子ページも含めて元に戻せません。コメントや履歴も消えます。"
          confirmLabel="削除"
          danger
          onClose={() => setPurgeId(null)}
          onConfirm={async () => {
            const id = purgeId;
            setPurgeId(null);
            await api(`/api/pages/${id}/purge`, { method: "DELETE" });
            await load();
            await onChanged();
          }}
        />
      )}
    </SideSheet>
  );
}
