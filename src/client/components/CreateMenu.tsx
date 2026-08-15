import { FileText, LayoutGrid, StickyNote } from "lucide-react";
import type { PageType, SavedTemplate } from "../lib/types";

export type CreateSeed = {
  type: PageType;
  title?: string;
  icon?: string;
  templateId?: string;
};

export function CreateMenuPanel({
  templates = [],
  onPick,
}: {
  templates?: SavedTemplate[];
  onPick: (seed: CreateSeed) => void;
}) {
  return (
    <div className="p-1">
      <p className="px-2 py-1.5 text-[11px] font-medium text-muted">新しく作る</p>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover max-[720px]:min-h-11"
        onClick={() => onPick({ type: "page" })}
      >
        <FileText size={15} className="text-muted" />
        ページ
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover max-[720px]:min-h-11"
        onClick={() => onPick({ type: "database", title: "データベース", icon: "🗃️" })}
      >
        <LayoutGrid size={15} className="text-muted" />
        データベース
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover max-[720px]:min-h-11"
        onClick={() => onPick({ type: "canvas", title: "キャンバス", icon: "🎨" })}
      >
        <StickyNote size={15} className="text-muted" />
        キャンバス
      </button>
      {templates.length > 0 && (
        <>
          <div className="my-1 h-px bg-line" />
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted">テンプレート</p>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover max-[720px]:min-h-11"
              onClick={() => onPick({ type: "page", title: t.title || t.name, icon: t.icon || "📄", templateId: t.id })}
            >
              <span className="w-[15px] text-center">{t.icon || "📄"}</span>
              <span className="min-w-0 truncate">{t.name}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
