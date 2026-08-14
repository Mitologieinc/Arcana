import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { toast } from "../lib/toast";
import { ConfirmModal } from "./ConfirmModal";
import { SideSheet } from "./SideSheet";

type Rev = {
  id: string;
  title: string;
  bodyText: string;
  createdAt: string | number | Date;
};

export function HistoryPanel({
  pageId,
  editable,
  onClose,
  onRestored,
}: {
  pageId: string;
  editable: boolean;
  onClose: () => void;
  onRestored: (title: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<Rev[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Rev | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ revisions: Rev[] }>(`/api/pages/${pageId}/revisions`)
      .then((d) => setRows(d.revisions))
      .catch(console.error);
  }, [pageId]);

  async function restore(rev: Rev) {
    setBusy(true);
    try {
      const res = await api<{ title: string }>(`/api/pages/${pageId}/revisions/${rev.id}/restore`, {
        method: "POST",
      });
      toast("この時点に戻しました");
      setPending(null);
      await onRestored(res.title);
    } catch (e) {
      toast(e instanceof Error ? e.message : "復元できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SideSheet title="履歴" onClose={onClose} width={440}>
        <div className="px-3 py-2 pb-8">
          {rows.length === 0 && <p className="py-6 text-[13px] text-muted">スナップショットはまだありません</p>}
          {rows.map((r) => (
            <div key={r.id} className="mb-1 rounded-[8px] hover:bg-hover">
              <button
                type="button"
                className="w-full px-2 py-2 text-left"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
              >
                <p className="truncate text-[13px] font-medium">{r.title || "無題"}</p>
                <p className="text-[11px] text-muted">{relativeTime(r.createdAt)}</p>
              </button>
              {openId === r.id && (
                <div className="px-2 pb-2">
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[6px] bg-canvas p-2 text-[12px] text-ink">
                    {r.bodyText || "（本文なし）"}
                  </pre>
                  {editable && (
                    <button
                      type="button"
                      className="btn btn-secondary mt-2 h-7 text-[12px]"
                      onClick={() => setPending(r)}
                    >
                      この時点に戻す
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </SideSheet>
      {pending && (
        <ConfirmModal
          title="この時点に戻す"
          body="タイトルと本文をこのスナップショットに戻します。書式や埋め込みはプレーンテキストになります。"
          confirmLabel={busy ? "復元中…" : "戻す"}
          onClose={() => {
            if (!busy) setPending(null);
          }}
          onConfirm={() => {
            if (!busy) void restore(pending);
          }}
        />
      )}
    </>
  );
}
