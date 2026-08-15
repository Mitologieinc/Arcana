import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { Member } from "../lib/types";
import { Avatar } from "./Avatar";
import { SideSheet } from "./SideSheet";

type Comment = {
  id: string;
  userId: string;
  name: string;
  body: string;
  createdAt: string | number | Date;
};

function mentionQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  const q = before.slice(at + 1);
  if (/[\s\n]/.test(q)) return null;
  return { start: at, query: q };
}

function MentionBody({ text, members }: { text: string; members: Member[] }) {
  const names = useMemo(
    () =>
      [...new Set(members.map((m) => m.name).filter(Boolean))].sort((a, b) => b.length - a.length),
    [members],
  );
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1)) ? (
          <span key={i} className="user-mention">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function CommentsPanel({
  pageId,
  userId,
  members = [],
  onClose,
}: {
  pageId: string;
  userId: string;
  members?: Member[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const [hideAt, setHideAt] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const at = hideAt ? null : mentionQuery(text, caret);
  const hits = useMemo(() => {
    if (!at) return [];
    const q = at.query.toLowerCase();
    return members
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [at, members]);

  async function load() {
    const d = await api<{ comments: Comment[] }>(`/api/pages/${pageId}/comments`);
    setRows(d.comments);
  }

  useEffect(() => {
    load().catch(console.error);
  }, [pageId]);

  function pick(m: Member) {
    if (!at) return;
    const next = `${text.slice(0, at.start)}@${m.name} ${text.slice(caret)}`;
    setText(next);
    setMentionIds((ids) => (ids.includes(m.userId) ? ids : [...ids, m.userId]));
    const pos = at.start + m.name.length + 2;
    setCaret(pos);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <SideSheet
      title="コメント"
      onClose={onClose}
      footer={
        <form
          className="relative border-t border-line p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = text.trim();
            if (!body) return;
            const ids = mentionIds.filter((id) => {
              const m = members.find((x) => x.userId === id);
              return m && body.includes(`@${m.name}`);
            });
            await api(`/api/pages/${pageId}/comments`, {
              method: "POST",
              body: JSON.stringify({ body, mentionIds: ids }),
            });
            setText("");
            setMentionIds([]);
            setCaret(0);
            await load();
          }}
        >
          {hits.length > 0 && (
            <div className="slash-menu menu-panel absolute inset-x-3 bottom-full mb-1">
              <p className="slash-kicker">メンバー</p>
              {hits.map((m, i) => (
                <button
                  key={m.userId}
                  type="button"
                  className={`slash-item ${i === hi ? "is-active" : ""}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(m)}
                >
                  <Avatar name={m.name} seed={m.userId} size={20} />
                  <span className="truncate text-[14px]">{m.name}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={area}
            className="mb-2 h-20 w-full resize-none rounded-[8px] border border-line px-2 py-1.5 text-[13px] outline-none"
            placeholder="コメント · @でメンション"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              setHi(0);
              setHideAt(false);
            }}
            onClick={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (!hits.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((i) => (i + 1) % hits.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((i) => (i + hits.length - 1) % hits.length);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                pick(hits[hi]!);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setHideAt(true);
              }
            }}
          />
          <button className="btn btn-primary h-8 px-3 text-[13px]" type="submit">
            送信
          </button>
        </form>
      }
    >
      <div className="px-4 py-2">
        {rows.length === 0 && <p className="py-6 text-[13px] text-muted">まだありません</p>}
        {rows.map((r) => (
          <div key={r.id} className="mb-3 flex gap-2">
            <Avatar name={r.name} seed={r.userId} size={22} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium">{r.name}</span>
                <span className="text-[11px] text-muted">{relativeTime(r.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[13px]">
                <MentionBody text={r.body} members={members} />
              </p>
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
          </div>
        ))}
      </div>
    </SideSheet>
  );
}
