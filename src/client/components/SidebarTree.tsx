import { ChevronRight, GripVertical, Plus } from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { computePosition, dropZoneFromY, isDescendantOf } from "../lib/dnd";
import type { Page } from "../lib/types";

type Props = {
  pages: Page[];
  currentId?: string;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onMove?: (id: string, parentId: string | null, position: number) => Promise<unknown>;
  compact?: boolean;
};

type TreeDrag = {
  id: string;
  overId: string | null;
  edge: "before" | "after" | "inside";
};

export function SidebarTree({ pages, currentId, onOpen, onCreateChild, onMove, compact }: Props) {
  const roots = useMemo(
    () => pages.filter((p) => !p.parentId).sort((a, b) => a.position - b.position),
    [pages],
  );
  const [drag, setDrag] = useState<TreeDrag | null>(null);
  const dragRef = useRef<TreeDrag | null>(null);
  dragRef.current = drag;

  async function commit(overRoot: boolean) {
    const current = dragRef.current;
    if (!current || !onMove) {
      setDrag(null);
      dragRef.current = null;
      return;
    }
    const dragged = pages.find((p) => p.id === current.id);
    if (!dragged) {
      setDrag(null);
      return;
    }
    if (overRoot && !current.overId) {
      const siblings = pages.filter((p) => !p.parentId && p.id !== current.id);
      const last = siblings.sort((a, b) => a.position - b.position).at(-1);
      await onMove(current.id, null, last ? last.position + 1 : 1);
      setDrag(null);
      dragRef.current = null;
      return;
    }
    if (!current.overId || current.overId === current.id) {
      setDrag(null);
      dragRef.current = null;
      return;
    }
    if (isDescendantOf(pages, current.id, current.overId)) {
      setDrag(null);
      dragRef.current = null;
      return;
    }
    const target = pages.find((p) => p.id === current.overId);
    if (!target) {
      setDrag(null);
      return;
    }
    if (current.edge === "inside") {
      const kids = pages.filter((p) => p.parentId === target.id).sort((a, b) => a.position - b.position);
      const last = kids.filter((k) => k.id !== current.id).at(-1);
      await onMove(current.id, target.id, last ? last.position + 1 : 1);
    } else {
      const siblings = pages.filter((p) => p.parentId === target.parentId).sort((a, b) => a.position - b.position);
      const position = computePosition(siblings, current.id, target.id, current.edge);
      await onMove(current.id, target.parentId, position);
    }
    setDrag(null);
    dragRef.current = null;
  }

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
    <div
      onDragOver={(e) => {
        if (!dragRef.current) return;
        e.preventDefault();
        if (e.target === e.currentTarget) {
          const next = { ...dragRef.current, overId: null, edge: "after" as const };
          dragRef.current = next;
          setDrag(next);
        }
      }}
      onDrop={() => void commit(true)}
    >
      {roots.map((p) => (
        <TreeNode
          key={p.id}
          page={p}
          pages={pages}
          depth={0}
          currentId={currentId}
          drag={drag}
          dragRef={dragRef}
          setDrag={setDrag}
          onOpen={onOpen}
          onCreateChild={onCreateChild}
          onCommit={() => void commit(false)}
          canDrag={Boolean(onMove)}
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
  drag,
  dragRef,
  setDrag,
  onOpen,
  onCreateChild,
  onCommit,
  canDrag,
}: {
  page: Page;
  pages: Page[];
  depth: number;
  currentId?: string;
  drag: TreeDrag | null;
  dragRef: { current: TreeDrag | null };
  setDrag: (d: TreeDrag | null) => void;
  onOpen: (id: string) => void;
  onCreateChild: (parentId: string) => void;
  onCommit: () => void;
  canDrag: boolean;
}) {
  const children = pages.filter((p) => p.parentId === page.id).sort((a, b) => a.position - b.position);
  const [open, setOpen] = useState(true);
  const active = currentId === page.id;
  const over = drag?.overId === page.id;
  const moving = drag?.id === page.id;

  function hover(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const current = dragRef.current;
    if (!current || current.id === page.id) return;
    const edge = dropZoneFromY(e.clientY, e.currentTarget.getBoundingClientRect());
    if (current.overId === page.id && current.edge === edge) return;
    const next = { ...current, overId: page.id, edge };
    dragRef.current = next;
    setDrag(next);
    if (edge === "inside" && children.length) setOpen(true);
  }

  return (
    <div>
      <div
        className={`group relative flex h-[30px] items-center rounded-[6px] pr-1 text-[14px] ${
          moving ? "opacity-40" : ""
        } ${over && drag?.edge === "inside" ? "arcana-drop-inside" : active ? "bg-[rgba(55,53,47,0.08)]" : "hover:bg-hover"}`}
        style={{ paddingLeft: 2 + depth * 12 }}
        onDragOver={hover}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCommit();
        }}
      >
        {over && drag?.edge === "before" && <div className="arcana-drop-line top-0" />}
        {over && drag?.edge === "after" && <div className="arcana-drop-line bottom-0" />}
        {canDrag && (
          <button
            type="button"
            className="arcana-grip mr-0.5 opacity-0 group-hover:opacity-100"
            draggable
            title="並べ替え"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", page.id);
              const next = { id: page.id, overId: null, edge: "before" as const };
              dragRef.current = next;
              setDrag(next);
            }}
            onDragEnd={() => {
              dragRef.current = null;
              setDrag(null);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} />
          </button>
        )}
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
            drag={drag}
            dragRef={dragRef}
            setDrag={setDrag}
            onOpen={onOpen}
            onCreateChild={onCreateChild}
            onCommit={onCommit}
            canDrag={canDrag}
          />
        ))}
    </div>
  );
}
