import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { api } from "../lib/api";
import type { DbProperty, Page, User } from "../lib/types";
import { TiptapEditor } from "../editor/TiptapEditor";
import { parseProps, PropertyValue } from "./PropertyValue";

export function RowPeek({
  page,
  schema,
  user,
  editable,
  shareToken,
  onClose,
  onOpenPage,
  onChanged,
}: {
  page: Page;
  schema: DbProperty[];
  user: User;
  editable: boolean;
  shareToken?: string;
  onClose: () => void;
  onOpenPage: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [title, setTitle] = useState(page.title);
  const props = parseProps(page.properties);
  const fields = schema.filter((p) => p.type !== "title");

  useEffect(() => setTitle(page.title), [page.id, page.title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      body: JSON.stringify({ properties: { ...props, [id]: value } }),
    });
    await onChanged();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button className="h-full flex-1 bg-[rgba(15,15,15,0.18)]" onClick={onClose} aria-label="閉じる" />
      <aside className="flex h-full w-[min(720px,92vw)] flex-col bg-white shadow-[-8px_0_40px_rgba(15,15,15,0.12)]">
        <header className="flex h-11 shrink-0 items-center justify-between px-3">
          <button className="btn-ghost h-8 gap-1.5 px-2 text-[13px] text-muted" onClick={onOpenPage}>
            <Maximize2 size={14} />
            ページとして開く
          </button>
          <button className="btn-ghost h-8 w-8 p-0 text-muted" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-12 pb-24 pt-6">
          <input
            autoFocus={!page.title}
            className="page-title text-[32px]"
            value={title}
            placeholder="無題"
            readOnly={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveTitle(title)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                void saveTitle(title);
                document.querySelector<HTMLElement>(".arcana-doc-peek")?.focus();
              }
            }}
          />
          {fields.length > 0 && (
            <div className="mt-6 space-y-1">
              {fields.map((p) => (
                <div key={p.id} className="flex min-h-8 items-center gap-4">
                  <span className="w-28 shrink-0 truncate text-[13px] text-muted">{p.name}</span>
                  <PropertyValue
                    property={p}
                    value={props[p.id]}
                    editable={editable}
                    onChange={(v) => void saveProp(p.id, v)}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="mt-8 border-t border-line pt-4">
            <TiptapEditor
              key={page.id}
              pageId={page.id}
              user={user}
              shareToken={shareToken}
              editable={editable}
              title={title}
              compact
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
