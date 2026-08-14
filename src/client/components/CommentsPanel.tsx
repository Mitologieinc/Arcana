import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";

type Comment = {
  id: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string | number | Date;
};

export function CommentsPanel({
  pageId,
  userId,
  onClose,
}: {
  pageId: string;
  userId: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [text, setText] = useState("");

  async function load() {
    const d = await api<{ comments: Comment[] }>(`/api/pages/${pageId}/comments`);
    setRows(d.comments);
  }

  useEffect(() => {
    load().catch(console.error);
  }, [pageId]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button className="flex-1 bg-[rgba(15,15,15,0.08)]" onClick={onClose} aria-label="閉じる" />
      <aside className="flex h-full w-[min(400px,92vw)] flex-col border-l border-line bg-white">
        <header className="flex h-11 items-center px-4 text-[14px] font-medium">コメント</header>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
          {rows.length === 0 && <p className="py-6 text-[13px] text-muted">まだありません</p>}
          {rows.map((r) => (
            <div key={r.id} className="mb-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">{r.name}</span>
                <span className="text-[11px] text-muted">{relativeTime(r.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[13px]">{r.body}</p>
              {r.userId === userId && (
                <button
                  className="mt-0.5 text-[11px] text-muted hover:text-danger"
                  onClick={async () => {
                    await api(`/api/comments/${r.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          className="border-t border-line p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = text.trim();
            if (!body) return;
            await api(`/api/pages/${pageId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
            setText("");
            await load();
          }}
        >
          <textarea
            className="mb-2 h-20 w-full resize-none rounded-[8px] border border-line px-2 py-1.5 text-[13px] outline-none"
            placeholder="コメント"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn-primary h-8 px-3 text-[13px]" type="submit">
            送信
          </button>
        </form>
      </aside>
    </div>
  );
}
