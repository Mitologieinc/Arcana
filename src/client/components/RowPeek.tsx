import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useIsMobile } from "../lib/media";
import type { DbProperty, Member, Page, User } from "../lib/types";
import { TiptapEditor } from "../editor/TiptapEditor";
import { parseProps, PropertyIcon, PropertyValue } from "./PropertyValue";

export function RowPeek({
  page,
  schema,
  user,
  editable,
  shareToken,
  members = [],
  pages = [],
  onClose,
  onOpenPage,
  onChanged,
  onDelete,
}: {
  page: Page;
  schema: DbProperty[];
  user: User;
  editable: boolean;
  shareToken?: string;
  members?: Member[];
  pages?: Page[];
  onClose: () => void;
  onOpenPage: (id?: string) => void;
  onChanged: () => Promise<unknown>;
  onDelete?: () => void;
}) {
  const isMobile = useIsMobile();
  const [title, setTitle] = useState(page.title);
  const props = parseProps(page.properties);
  const fields = schema.filter((p) => p.type !== "title");
  const startY = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  useEffect(() => setTitle(page.title), [page.id, page.title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function saveTitle(next: string) {
    setTitle(next);
    if (!editable) return;
    await api(`/api/pages/${page.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: next }),
    });
    await onChanged();
  }

  async function saveProp(id: string, value: unknown) {
    await api(`/api/pages/${page.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { [id]: value } }),
    });
    await onChanged();
  }

  function onHandleDown(e: ReactPointerEvent) {
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHandleMove(e: ReactPointerEvent) {
    if (startY.current == null) return;
    const next = Math.max(0, e.clientY - startY.current);
    dragYRef.current = next;
    setDragY(next);
  }

  function onHandleUp() {
    if (startY.current == null) return;
    if (dragYRef.current > 80) onClose();
    else setDragY(0);
    dragYRef.current = 0;
    startY.current = null;
  }

  const sheet = (
    <div className="fixed inset-0 z-40 flex justify-end max-[720px]:flex-col max-[720px]:justify-end">
      <button className="h-full flex-1 bg-[rgba(15,15,15,0.08)]" onClick={onClose} aria-label="閉じる" />
      <aside
        className="arcana-sheet arcana-peek flex h-full w-[min(720px,92vw)] flex-col border-l border-line bg-white"
        style={isMobile && dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        {isMobile && (
          <div
            className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
        )}
        <header className="flex h-12 shrink-0 items-center justify-between px-3">
          <button
            className={`btn-ghost h-9 px-2 ${isMobile ? "text-[15px] font-medium text-cf" : "text-[13px] text-muted"}`}
            onClick={onClose}
          >
            {isMobile ? "完了" : "閉じる"}
          </button>
          <div className="flex items-center">
            <button className="btn-ghost h-9 gap-1.5 px-2 text-[13px] text-muted" onClick={() => onOpenPage()}>
              <Maximize2 size={14} />
              ページとして開く
            </button>
            {editable && onDelete && (
              <button className="btn-ghost h-9 w-9 p-0 text-muted" onClick={onDelete} title="削除">
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-8 pb-24 pt-6 max-[720px]:px-4 max-[720px]:pt-2">
          <input
            autoFocus={!page.title}
            className="page-title text-[32px] max-[720px]:text-[26px]"
            value={title}
            placeholder="名前を入力"
            readOnly={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveTitle(title)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                void saveTitle(title);
                if (!isMobile) document.querySelector<HTMLElement>(".arcana-doc-peek")?.focus();
                else e.currentTarget.blur();
              }
            }}
          />
          {fields.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-[12px] border border-line">
              {fields.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex min-h-11 items-center gap-3 px-3 py-1 ${i ? "border-t border-line" : ""}`}
                >
                  <span className="flex w-[6.5rem] shrink-0 items-center gap-1.5 truncate text-[13px] text-muted">
                    <PropertyIcon type={p.type} />
                    {p.name}
                  </span>
                  <div className="min-w-0 flex-1">
                    <PropertyValue
                      property={p}
                      value={props[p.id]}
                      editable={editable}
                      members={members}
                      pages={pages}
                      title={title}
                      schema={schema}
                      allProps={props}
                      onChange={(v) => void saveProp(p.id, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6">
            <p className="mb-2 px-0.5 text-[12px] font-medium text-muted">メモ</p>
            <div className="rounded-[12px] border border-line px-3 py-2">
              <TiptapEditor
                key={page.id}
                pageId={page.id}
                user={user}
                shareToken={shareToken}
                editable={editable}
                title={title}
                compact
                onOpenPage={(id) => onOpenPage(id)}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );

  return createPortal(sheet, document.body);
}
