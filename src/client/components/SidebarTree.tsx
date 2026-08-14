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
        <p className="px-2 py-6 text-center text-[12px] text-muted">ページはまだありません</p>
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
        className={`group flex items-center pr-1 text-[13px] ${active ? "bg-white shadow-[inset_2px_0_0_#f6821f]" : "hover:bg-white/80"}`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <button className="p-1 text-muted" onClick={() => setOpen((v) => !v)} aria-label="展開">
          <ChevronRight size={12} className={open && children.length ? "rotate-90" : ""} />
        </button>
        <button className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left" onClick={() => onOpen(page.id)}>
          <span className="text-[12px]">{page.icon || (page.type === "database" ? "▦" : "▪")}</span>
          <span className="truncate">{page.title || "無題"}</span>
        </button>
        <button
          className="hidden rounded p-1 text-muted group-hover:block"
          onClick={() => onCreateChild(page.id)}
          title="子ページ"
        >
          <Plus size={12} />
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
