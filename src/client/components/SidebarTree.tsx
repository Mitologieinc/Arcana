import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Page } from "../lib/types";

type Props = {
  pages: Page[];
  currentId?: string;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  compact?: boolean;
};

export function SidebarTree({ pages, currentId, onOpen, onCreateChild, compact }: Props) {
  const roots = useMemo(
    () => pages.filter((p) => !p.parentId).sort((a, b) => a.position - b.position),
    [pages],
  );

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        {roots.map((p) => (
          <button
            key={p.id}
            className={`flex h-8 w-8 items-center justify-center rounded-[6px] text-[15px] ${
              currentId === p.id ? "bg-[rgba(55,53,47,0.08)]" : "hover:bg-hover"
            }`}
            title={p.title || "無題"}
            onClick={() => onOpen(p.id)}
          >
            {p.icon || (p.type === "database" ? "🗃️" : "📄")}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
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
        className={`group flex h-[30px] items-center rounded-[6px] pr-1 text-[14px] ${active ? "bg-[rgba(55,53,47,0.08)]" : "hover:bg-hover"}`}
        style={{ paddingLeft: 2 + depth * 12 }}
      >
        <button
          className={`flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-black/5 ${children.length ? "" : "opacity-0 group-hover:opacity-100"}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="展開"
        >
          <ChevronRight size={14} className={open && children.length ? "rotate-90 transition-transform" : "transition-transform"} />
        </button>
        <button className="flex min-w-0 flex-1 items-center gap-1.5 px-0.5 text-left" onClick={() => onOpen(page.id)}>
          <span className="text-[15px] leading-none">{page.icon || (page.type === "database" ? "🗃️" : "📄")}</span>
          <span className={`min-w-0 truncate ${page.title ? "text-ink" : "text-muted"}`}>{page.title || "無題"}</span>
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
