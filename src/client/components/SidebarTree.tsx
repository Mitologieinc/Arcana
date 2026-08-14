import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Page } from "../lib/types";

type Props = {
  pages: Page[];
  currentId?: string;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
};

export function SidebarTree({ pages, currentId, onOpen, onCreateChild }: Props) {
  const roots = useMemo(
    () => pages.filter((p) => !p.parentId).sort((a, b) => a.position - b.position),
    [pages],
  );

  return (
    <div>
      {roots.length === 0 && (
        <p className="px-2 py-4 text-[12px] text-muted">ページはまだありません</p>
      )}
      {roots.map((p) => (
        <TreeNode
          key={p.id}
          page={p}
          pages={pages}
          depth={0}
          currentId={currentId}
          onOpen={onOpen}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  );
}

function TreeNode({
  page,
  pages,
  depth,
  currentId,
  onOpen,
  onCreateChild,
}: {
  page: Page;
  pages: Page[];
  depth: number;
  currentId?: string;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
}) {
  const children = pages.filter((p) => p.parentId === page.id).sort((a, b) => a.position - b.position);
  const [open, setOpen] = useState(true);
  const active = currentId === page.id;

  return (
    <div>
      <div
        className={`group flex h-[30px] items-center rounded-[6px] pr-1 text-[14px] ${active ? "bg-hover" : "hover:bg-hover"}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/5"
          onClick={() => setOpen((v) => !v)}
          aria-label="展開"
        >
          <ChevronRight size={14} className={open && children.length ? "rotate-90" : "opacity-50"} />
        </button>
        <button className="flex min-w-0 flex-1 items-center gap-1.5 px-0.5 text-left" onClick={() => onOpen(page.id)}>
          <span className="text-[14px] leading-none">{page.icon || (page.type === "database" ? "🗃️" : "📄")}</span>
          <span className="truncate text-[#37352f]">{page.title || "無題"}</span>
        </button>
        <button
          className="hidden h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/5 group-hover:flex"
          onClick={() => onCreateChild(page.id)}
          title="子ページを追加"
        >
          <Plus size={14} />
        </button>
      </div>
      {open &&
        children.map((child) => (
          <TreeNode
            key={child.id}
            page={child}
            pages={pages}
            depth={depth + 1}
            currentId={currentId}
            onOpen={onOpen}
            onCreateChild={onCreateChild}
          />
        ))}
    </div>
  );
}
