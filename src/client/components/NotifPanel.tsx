import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { SideSheet } from "./SideSheet";

type Row = {
  id: string;
  pageId: string | null;
  body: string;
  readAt: string | number | Date | null;
  createdAt: string | number | Date;
};

export function NotifPanel({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (pageId: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const d = await api<{ notifications: Row[] }>("/api/notifications");
    setRows(d.notifications);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  return (
    <SideSheet
      title="通知"
      onClose={onClose}
      extra={
        <button
          className="text-[12px] text-muted hover:text-ink"
          onClick={async () => {
            await api("/api/notifications/read", { method: "POST", body: JSON.stringify({}) });
            await load();
          }}
        >
          すべて既読
        </button>
      }
    >
      <div className="px-2 py-2 pb-8">
        {rows.length === 0 && <p className="px-2 py-6 text-[13px] text-muted">通知はありません</p>}
        {rows.map((n) => (
          <button
            key={n.id}
            className={`flex w-full flex-col items-start rounded-[8px] px-2 py-2 text-left hover:bg-hover ${n.readAt ? "" : "bg-[rgba(35,131,226,0.06)]"}`}
            onClick={async () => {
              await api("/api/notifications/read", { method: "POST", body: JSON.stringify({ id: n.id }) });
              if (n.pageId) onOpen(n.pageId);
              else onClose();
            }}
          >
            <span className="text-[13px]">{n.body}</span>
            <span className="text-[11px] text-muted">{relativeTime(n.createdAt)}</span>
          </button>
        ))}
      </div>
    </SideSheet>
  );
}
