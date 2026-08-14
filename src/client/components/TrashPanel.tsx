import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Page } from "../lib/types";
import { relativeTime } from "../lib/format";
import { SideSheet } from "./SideSheet";

export function TrashPanel({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [pages, setPages] = useState<Page[]>([]);

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
            <span className="text-[15px]">{p.icon || "📄"}</span>
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
              onClick={async () => {
                await api(`/api/pages/${p.id}/purge`, { method: "DELETE" });
                await load();
                await onChanged();
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </SideSheet>
  );
}
