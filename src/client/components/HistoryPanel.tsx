import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { SideSheet } from "./SideSheet";

type Rev = {
  id: string;
  title: string;
  bodyText: string;
  createdAt: string | number | Date;
};

export function HistoryPanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Rev[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api<{ revisions: Rev[] }>(`/api/pages/${pageId}/revisions`)
      .then((d) => setRows(d.revisions))
      .catch(console.error);
  }, [pageId]);

  return (
    <SideSheet title="履歴" onClose={onClose} width={440}>
      <div className="px-3 py-2 pb-8">
        {rows.length === 0 && <p className="py-6 text-[13px] text-muted">スナップショットはまだありません</p>}
        {rows.map((r) => (
          <button
            key={r.id}
            className="mb-1 w-full rounded-[8px] px-2 py-2 text-left hover:bg-hover"
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
          >
            <p className="truncate text-[13px] font-medium">{r.title || "無題"}</p>
            <p className="text-[11px] text-muted">{relativeTime(r.createdAt)}</p>
            {openId === r.id && (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[6px] bg-canvas p-2 text-[12px] text-ink">
                {r.bodyText || "（本文なし）"}
              </pre>
            )}
          </button>
        ))}
      </div>
    </SideSheet>
  );
}
