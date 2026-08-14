import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CalendarDays, Columns3, GripVertical, LayoutGrid, Plus, Search, Table2, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { computePosition, dropEdgeFromY, reorderIds, type DropEdge } from "../lib/dnd";
import type { DbFilter, DbProperty, DbView, Member, Page } from "../lib/types";
import { FloatMenu } from "./FloatMenu";
import {
  optionClass,
  parseProps,
  PROPERTY_TYPES,
  PropertyIcon,
  PropertyValue,
} from "./PropertyValue";

type DragKind = "row" | "card" | "col";
type DragState = {
  type: DragKind;
  id: string;
  overId: string | null;
  edge: DropEdge;
  overCol?: string;
};

type Props = {
  pageId: string;
  schema: DbProperty[];
  views: DbView[];
  rows: Page[];
  pages?: Page[];
  members?: Member[];
  editable: boolean;
  embedded?: boolean;
  onOpenRow: (id: string) => void;
  onChanged: () => Promise<unknown>;
};

function applyFilters(rows: Page[], schema: DbProperty[], filters: DbFilter[] | undefined) {
  if (!filters?.length) return rows;
  return rows.filter((row) => {
    const props = parseProps(row.properties);
    return filters.every((f) => {
      const prop = schema.find((p) => p.id === f.propertyId);
      const raw = prop?.type === "title" ? row.title : String(props[f.propertyId] ?? "");
      if (f.op === "contains") return raw.includes(f.value);
      return raw === f.value;
    });
  });
}

function applySorts(rows: Page[], schema: DbProperty[], sorts: DbView["config"]["sorts"]) {
  if (!sorts?.length) return [...rows].sort((a, b) => a.position - b.position);
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const prop = schema.find((p) => p.id === s.propertyId);
      const av = prop?.type === "title" ? a.title : String(parseProps(a.properties)[s.propertyId] ?? "");
      const bv = prop?.type === "title" ? b.title : String(parseProps(b.properties)[s.propertyId] ?? "");
      const cmp = av.localeCompare(bv, "ja", { numeric: true });
      if (cmp) return s.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

function createProperty(type: Exclude<DbProperty["type"], "title">): DbProperty {
  const found = PROPERTY_TYPES.find((t) => t.type === type);
  const prop: DbProperty = {
    id: crypto.randomUUID().slice(0, 8),
    type,
    name: found?.name ?? "プロパティ",
  };
  if (type === "select") prop.options = [];
  if (type === "status") {
    prop.options = [
      { id: "todo", name: "未着手", color: "gray" },
      { id: "doing", name: "進行中", color: "blue" },
      { id: "done", name: "完了", color: "green" },
    ];
  }
  if (type === "formula") prop.expression = "{名前}";
  return prop;
}

export function DatabaseView({
  pageId,
  schema,
  views,
  rows,
  pages = [],
  members = [],
  editable,
  embedded = false,
  onOpenRow,
  onChanged,
}: Props) {
  const gutter = embedded ? "" : "px-24 max-[860px]:px-6";
  const [viewId, setViewId] = useState(views[0]?.id);
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const [filterMenu, setFilterMenu] = useState<DOMRect | null>(null);
  const [equalsFilter, setEqualsFilter] = useState<{ propertyId: string; value: string } | null>(null);
  const [filterValue, setFilterValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [addProp, setAddProp] = useState<DOMRect | null>(null);
  const [addView, setAddView] = useState<DOMRect | null>(null);
  const [rename, setRename] = useState("");
  const [calCursor, setCalCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipTitleBlur = useRef(false);
  const dragging = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const filtered = useMemo(() => {
    const extra: DbFilter[] = [
      ...(filterValue ? [{ propertyId: "title", op: "contains" as const, value: filterValue }] : []),
      ...(equalsFilter ? [{ propertyId: equalsFilter.propertyId, op: "equals" as const, value: equalsFilter.value }] : []),
    ];
    return applySorts(
      applyFilters(rows, schema, [...(view?.config.filters ?? []), ...extra]),
      schema,
      view?.config.sorts,
    );
  }, [rows, schema, view, filterValue, equalsFilter]);

  useEffect(() => {
    if (editingTitleId) titleInputRef.current?.focus();
  }, [editingTitleId, rows.length]);

  async function saveSchema(next: DbProperty[]) {
    await api(`/api/pages/${pageId}/schema`, {
      method: "PUT",
      body: JSON.stringify({ properties: next }),
    });
    await onChanged();
  }

  async function saveView(config: DbView["config"]) {
    if (!view) return;
    await api(`/api/views/${view.id}`, {
      method: "PATCH",
      body: JSON.stringify({ config }),
    });
    await onChanged();
  }

  async function addRow(groupValue?: string) {
    const properties: Record<string, unknown> = {};
    const groupId = view?.config.groupBy ?? "status";
    if (groupValue) properties[groupId] = groupValue;
    const res = await api<{ page: Page }>("/api/pages", {
      method: "POST",
      body: JSON.stringify({ parentId: pageId, type: "page", title: "", properties }),
    });
    await onChanged();
    setEditingTitleId(res.page.id);
  }

  async function updateRow(
    row: Page,
    patch: { title?: string; properties?: Record<string, unknown>; position?: number },
  ) {
    await api(`/api/pages/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: patch.title ?? row.title,
        properties: patch.properties ?? parseProps(row.properties),
        position: patch.position,
      }),
    });
    await onChanged();
  }

  async function deleteRow(id: string) {
    await api(`/api/pages/${id}`, { method: "DELETE" });
    await onChanged();
  }

  if (!view) {
    return <p className={`mt-6 text-muted ${gutter}`}>ビューがありません</p>;
  }

  const statusProp =
    schema.find((p) => p.id === (view.config.groupBy ?? "status")) ??
    schema.find((p) => p.type === "select" || p.type === "status");
  const dataProps = schema.filter((p) => p.type !== "title");
  const titleProp = schema.find((p) => p.type === "title");
  const canReorderRows = editable && !view.config.sorts?.length && !filterValue && !equalsFilter;

  function beginDrag(e: DragEvent, type: DragKind, id: string) {
    dragging.current = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("application/x-arcana", JSON.stringify({ type, id }));
    const next: DragState = { type, id, overId: null, edge: "before" };
    dragRef.current = next;
    setDrag(next);
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = "0.4";
  }

  function hoverDrag(e: DragEvent, overId: string, overCol?: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const current = dragRef.current;
    if (!current || current.id === overId) return;
    const useEdge: DropEdge =
      current.type === "col"
        ? e.clientX < e.currentTarget.getBoundingClientRect().left + e.currentTarget.getBoundingClientRect().width / 2
          ? "before"
          : "after"
        : dropEdgeFromY(e.clientY, e.currentTarget.getBoundingClientRect());
    if (current.overId === overId && current.edge === useEdge && current.overCol === overCol) return;
    const next = { ...current, overId, edge: useEdge, overCol };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag(e?: DragEvent) {
    if (e) (e.currentTarget as HTMLElement).style.opacity = "";
    window.setTimeout(() => {
      dragging.current = false;
    }, 0);
    dragRef.current = null;
    setDrag(null);
  }

  async function commitCardDrop(colStatus: string | undefined) {
    const current = dragRef.current;
    if (!current || (current.type !== "card" && current.type !== "row") || !statusProp) {
      endDrag();
      return;
    }
    const row = rows.find((r) => r.id === current.id);
    if (!row) {
      endDrag();
      return;
    }
    const nextProps = { ...parseProps(row.properties), [statusProp.id]: colStatus ?? "" };
    const colRows = rows
      .filter((r) => {
        if (r.id === row.id) return true;
        const raw = String(parseProps(r.properties)[statusProp.id] ?? "");
        return colStatus ? raw === colStatus : !raw;
      })
      .sort((a, b) => a.position - b.position);
    const position = computePosition(colRows, current.id, current.overId, current.overId ? current.edge : "after");
    endDrag();
    await updateRow(row, { properties: nextProps, position });
  }

  async function commitRowDrop() {
    const current = dragRef.current;
    if (!current || current.type !== "row" || !current.overId) {
      endDrag();
      return;
    }
    const row = rows.find((r) => r.id === current.id);
    if (!row) {
      endDrag();
      return;
    }
    const ordered = [...rows].sort((a, b) => a.position - b.position);
    const position = computePosition(ordered, current.id, current.overId, current.edge);
    endDrag();
    await updateRow(row, { position });
  }

  async function commitColDrop() {
    const current = dragRef.current;
    if (!current || current.type !== "col" || !current.overId || current.id === current.overId) {
      endDrag();
      return;
    }
    const ids = dataProps.map((p) => p.id);
    const nextIds = reorderIds(ids, current.id, current.overId, current.edge);
    const map = new Map(schema.map((p) => [p.id, p]));
    const title = schema.filter((p) => p.type === "title");
    endDrag();
    await saveSchema([...title, ...nextIds.map((id) => map.get(id)!).filter(Boolean)]);
  }

  function titleCell(row: Page) {
    const editing = editingTitleId === row.id;
    if (editing) {
      return (
        <input
          ref={titleInputRef}
          className="w-full border-none bg-transparent text-[14px] outline-none placeholder:text-muted"
          defaultValue={row.title}
          placeholder="無題"
          onBlur={(e) => {
            if (skipTitleBlur.current) {
              skipTitleBlur.current = false;
              return;
            }
            const next = e.target.value;
            setEditingTitleId(null);
            if (next !== row.title) void updateRow(row, { title: next });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              skipTitleBlur.current = true;
              const next = e.currentTarget.value;
              void (async () => {
                if (next !== row.title) await updateRow(row, { title: next });
                const groupId = view?.config.groupBy ?? "status";
                const groupValue = String(parseProps(row.properties)[groupId] ?? "") || undefined;
                await addRow(view?.type === "board" ? groupValue : undefined);
              })();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditingTitleId(null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <div className="group/title flex min-w-0 items-center gap-1">
        <button
          className={`min-w-0 flex-1 truncate text-left text-[14px] ${row.title ? "" : "text-muted"}`}
          onClick={() => onOpenRow(row.id)}
        >
          {row.icon ? `${row.icon} ` : ""}
          {row.title || "無題"}
        </button>
        <button
          className="hidden h-6 shrink-0 rounded-[4px] border border-line px-1.5 text-[11px] text-muted group-hover/title:inline-flex group-hover/title:items-center hover:bg-hover"
          onClick={(e) => {
            e.stopPropagation();
            onOpenRow(row.id);
          }}
        >
          開く
        </button>
      </div>
    );
  }

  const headerMenuProp = headerMenu ? schema.find((p) => p.id === headerMenu.id) : null;

  return (
    <div className="mt-3">
      <div className={`mb-1 flex flex-wrap items-center gap-1 ${gutter}`}>
        {views.map((v) => (
          <button
            key={v.id}
            className={`flex h-8 items-center gap-1.5 rounded-[6px] px-2 text-[13px] ${
              v.id === view.id ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover hover:text-ink"
            }`}
            onClick={() => setViewId(v.id)}
          >
            {v.type === "board" ? <Columns3 size={14} /> : v.type === "calendar" ? <CalendarDays size={14} /> : v.type === "gallery" ? <LayoutGrid size={14} /> : <Table2 size={14} />}
            {v.name}
          </button>
        ))}
        {searchOpen ? (
          <input
            autoFocus
            className="ml-1 h-8 w-44 rounded-md border-none bg-transparent px-2 text-[13px] outline-none placeholder:text-muted hover:bg-hover focus:bg-hover"
            placeholder="検索"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onBlur={() => {
              if (!filterValue) setSearchOpen(false);
            }}
          />
        ) : (
          <button
            className="btn-ghost ml-1 h-8 w-8 p-0 text-muted"
            title="検索"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={15} />
          </button>
        )}
        {statusProp && (
          <button
            className={`h-8 rounded-[6px] px-2 text-[13px] ${equalsFilter ? "bg-hover text-ink" : "text-muted hover:bg-hover"}`}
            onClick={(e) => setFilterMenu(e.currentTarget.getBoundingClientRect())}
          >
            フィルター
          </button>
        )}
        {editable && (
          <button
            className="btn-ghost h-8 w-8 p-0 text-muted"
            title="ビューを追加"
            onClick={(e) => setAddView(e.currentTarget.getBoundingClientRect())}
          >
            <Plus size={15} />
          </button>
        )}
        {editable && views.length > 1 && (
          <button
            className="btn-ghost h-8 px-2 text-[12px] text-muted"
            onClick={() => void api(`/api/views/${view.id}`, { method: "DELETE" }).then(onChanged)}
          >
            ビュー削除
          </button>
        )}
        {editable && (
          <button className="btn-ghost ml-auto h-8 px-2.5 text-[13px]" onClick={() => void addRow()}>
            新規
          </button>
        )}
      </div>

      {view.type === "gallery" ? (
        <div className={`grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 ${gutter}`}>
          {filtered.map((row) => (
            <button
              key={row.id}
              className="overflow-hidden rounded-[10px] border border-line text-left hover:bg-hover"
              onClick={() => onOpenRow(row.id)}
            >
              <div className="h-24 bg-canvas">
                {row.coverR2Key && <img src={`/api/files/${row.coverR2Key}`} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="px-3 py-2 text-[14px]">{row.icon ? `${row.icon} ` : ""}{row.title || "無題"}</div>
            </button>
          ))}
          {editable && (
            <button className="rounded-[10px] border border-dashed border-line px-3 py-8 text-[13px] text-muted hover:bg-hover" onClick={() => void addRow()}>
              + 新規
            </button>
          )}
        </div>
      ) : view.type === "calendar" ? (
        <div className={gutter}>
          {(() => {
            const dateProp = schema.find((p) => p.type === "date") ?? schema.find((p) => p.id === view.config.groupBy);
            const start = new Date(calCursor.y, calCursor.m, 1);
            const startPad = (start.getDay() + 6) % 7;
            const days = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
            const cells = [...Array(startPad + days)].map((_, i) => {
              if (i < startPad) return null;
              const day = i - startPad + 1;
              const iso = `${calCursor.y}-${String(calCursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayRows = dateProp
                ? filtered.filter((r) => String(parseProps(r.properties)[dateProp.id] ?? "") === iso)
                : [];
              return { day, iso, dayRows };
            });
            return (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <button
                    className="btn-ghost h-7 px-2 text-[13px] text-muted"
                    onClick={() =>
                      setCalCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
                    }
                  >
                    ←
                  </button>
                  <p className="text-[13px] text-muted">
                    {calCursor.y}年{calCursor.m + 1}月
                  </p>
                  <button
                    className="btn-ghost h-7 px-2 text-[13px] text-muted"
                    onClick={() =>
                      setCalCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))
                    }
                  >
                    →
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-px rounded-[8px] bg-line">
                  {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
                    <div key={d} className="bg-white px-2 py-1 text-[11px] text-muted">{d}</div>
                  ))}
                  {cells.map((cell, i) => (
                    <div key={i} className="min-h-24 bg-white p-1">
                      {cell && (
                        <>
                          <div className="text-[11px] text-muted">{cell.day}</div>
                          {cell.dayRows.map((r) => (
                            <button key={r.id} className="mt-0.5 block w-full truncate rounded px-1 text-left text-[12px] hover:bg-hover" onClick={() => onOpenRow(r.id)}>
                              {r.title || "無題"}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : view.type === "board" && statusProp ? (
        <div className={`flex gap-3 overflow-x-auto pb-2 ${gutter}`}>
          {(() => {
            const options = statusProp.options ?? [];
            const known = new Set(options.map((o) => o.id));
            const columns: { id: string; name: string; color?: string; status?: string }[] = [
              { id: "__empty__", name: "ステータスなし" },
              ...options.map((o) => ({ id: o.id, name: o.name, color: o.color, status: o.id })),
            ];
            return columns.map((col) => {
              const colRows = filtered.filter((r) => {
                const raw = String(parseProps(r.properties)[statusProp.id] ?? "");
                if (col.id === "__empty__") return !raw || !known.has(raw);
                return raw === col.id;
              });
              if (col.id === "__empty__" && colRows.length === 0) return null;
              return (
                <div
                  key={col.id}
                  className={`w-[260px] shrink-0 rounded-[10px] bg-canvas p-2 ${
                    drag?.type === "card" && drag.overCol === col.id ? "arcana-drop-col" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const current = dragRef.current;
                    if (!current || current.type !== "card") return;
                    if ((e.target as HTMLElement).closest("[data-card]")) return;
                    const next = { ...current, overId: null, overCol: col.id, edge: "after" as const };
                    dragRef.current = next;
                    setDrag(next);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void commitCardDrop(col.status);
                  }}
                >
                  <div className="mb-2 flex items-center gap-1.5 px-1.5 text-[12px] font-medium text-muted">
                    {col.color ? (
                      <span className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(col.color)}`}>
                        {col.name}
                      </span>
                    ) : (
                      col.name
                    )}
                    <span className="text-[#c4c2bc]">{colRows.length}</span>
                  </div>
                  {colRows.map((row) => {
                    const props = parseProps(row.properties);
                    const extras = dataProps.filter((p) => p.id !== statusProp.id && props[p.id]);
                    return (
                      <div
                        key={row.id}
                        data-card
                        draggable={editable && editingTitleId !== row.id}
                        onDragStart={(e) => beginDrag(e, "card", row.id)}
                        onDragOver={(e) => hoverDrag(e, row.id, col.id)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void commitCardDrop(col.status);
                        }}
                        onDragEnd={(e) => endDrag(e)}
                        className={`relative mb-2 cursor-pointer rounded-[8px] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(15,15,15,0.06)] hover:bg-[#fafafa] ${
                          drag?.id === row.id ? "opacity-40" : ""
                        }`}
                        onClick={() => {
                          if (dragging.current || editingTitleId === row.id) return;
                          onOpenRow(row.id);
                        }}
                      >
                        {drag?.type === "card" && drag.overId === row.id && drag.id !== row.id && (
                          <div className={`arcana-drop-line ${drag.edge === "before" ? "top-0" : "bottom-0"}`} />
                        )}
                        {editingTitleId === row.id ? (
                          titleCell(row)
                        ) : (
                          <div className={`text-[14px] ${row.title ? "" : "text-muted"}`}>{row.title || "無題"}</div>
                        )}
                        {extras.length > 0 && editingTitleId !== row.id && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {extras.map((p) => {
                              if (p.type === "select" || p.type === "status") {
                                const current = p.options?.find((o) => o.id === String(props[p.id] ?? ""));
                                if (!current) return null;
                                return (
                                  <span
                                    key={p.id}
                                    className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(current.color)}`}
                                  >
                                    {current.name}
                                  </span>
                                );
                              }
                              return (
                                <span key={p.id} className="text-[12px] text-muted">
                                  {String(props[p.id])}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {editable && (
                    <button
                      className="w-full rounded-md px-1.5 py-1.5 text-left text-[13px] text-muted hover:bg-hover"
                      onClick={() => void addRow(col.status)}
                    >
                      + 新規
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="arcana-db-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-muted"
                    onClick={(e) => {
                      if (!editable || !titleProp) return;
                      setRename(titleProp.name);
                      setHeaderMenu({ id: titleProp.id, rect: e.currentTarget.getBoundingClientRect() });
                    }}
                  >
                    <PropertyIcon type="title" />
                    {titleProp?.name ?? "名前"}
                  </button>
                </th>
                {dataProps.map((p) => (
                  <th
                    key={p.id}
                    className={`min-w-[140px] ${
                      drag?.type === "col" && drag.overId === p.id
                        ? drag.edge === "before"
                          ? "arcana-drop-before"
                          : "arcana-drop-after"
                        : ""
                    }`}
                    draggable={editable}
                    onDragStart={(e) => beginDrag(e, "col", p.id)}
                    onDragOver={(e) => hoverDrag(e, p.id)}
                    onDrop={(e) => {
                      e.preventDefault();
                      void commitColDrop();
                    }}
                    onDragEnd={(e) => endDrag(e)}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 text-left text-muted"
                      onClick={(e) => {
                        if (dragging.current || !editable) return;
                        setRename(p.name);
                        setHeaderMenu({ id: p.id, rect: e.currentTarget.getBoundingClientRect() });
                      }}
                    >
                      <PropertyIcon type={p.type} />
                      <span className="truncate">{p.name}</span>
                    </button>
                  </th>
                ))}
                {editable && (
                  <th className="arcana-db-add">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center text-muted hover:bg-hover"
                      title="プロパティを追加"
                      onClick={(e) => setAddProp(e.currentTarget.getBoundingClientRect())}
                    >
                      <Plus size={15} />
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const props = parseProps(row.properties);
                return (
                  <tr
                    key={row.id}
                    className={`group ${
                      drag?.type === "row" && drag.id === row.id ? "opacity-40" : ""
                    } ${
                      drag?.type === "row" && drag.overId === row.id
                        ? drag.edge === "before"
                          ? "arcana-drop-before"
                          : "arcana-drop-after"
                        : ""
                    }`}
                    onDragOver={(e) => canReorderRows && hoverDrag(e, row.id)}
                    onDrop={(e) => {
                      if (!canReorderRows) return;
                      e.preventDefault();
                      void commitRowDrop();
                    }}
                  >
                    <td>
                      <div className="flex min-w-0 items-center gap-1">
                        {canReorderRows && (
                          <button
                            type="button"
                            className="arcana-grip absolute left-[72px] z-[2] opacity-0 group-hover:opacity-100 max-[860px]:left-1"
                            draggable
                            title="並べ替え"
                            onDragStart={(e) => beginDrag(e, "row", row.id)}
                            onDragEnd={(e) => endDrag(e)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical size={14} />
                          </button>
                        )}
                        <div className="min-w-0 flex-1">{titleCell(row)}</div>
                        {editable && (
                          <button
                            className="btn-ghost h-6 w-6 shrink-0 p-0 text-muted opacity-0 group-hover:opacity-100"
                            title="削除"
                            onClick={() => void deleteRow(row.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    {dataProps.map((p) => (
                      <td key={p.id}>
                        <PropertyValue
                          property={p}
                          value={props[p.id]}
                          editable={editable}
                          members={members}
                          pages={pages.length ? pages : rows}
                          title={row.title}
                          schema={schema}
                          allProps={props}
                          onChange={(v) => void updateRow(row, { properties: { ...props, [p.id]: v } })}
                          onUpdateOptions={(options) =>
                            void saveSchema(schema.map((s) => (s.id === p.id ? { ...s, options } : s)))
                          }
                        />
                      </td>
                    ))}
                    {editable && <td className="arcana-db-add" />}
                  </tr>
                );
              })}
              {editable && (
                <tr>
                  <td>
                    <button
                      className="h-8 w-full text-left text-[13px] text-muted hover:text-ink"
                      onClick={() => void addRow()}
                    >
                      + 新規
                    </button>
                  </td>
                  {dataProps.map((p) => (
                    <td key={p.id} />
                  ))}
                  {editable && <td className="arcana-db-add" />}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {headerMenu && headerMenuProp && (
        <FloatMenu
          anchor={headerMenu.rect}
          onClose={() => setHeaderMenu(null)}
          width={220}
        >
          <input
            className="mb-1 h-8 w-full rounded-[6px] bg-canvas px-2 text-[13px] outline-none"
            value={rename}
            onChange={(e) => setRename(e.target.value)}
            onBlur={() => {
              if (rename.trim() && rename !== headerMenuProp.name) {
                void saveSchema(schema.map((p) => (p.id === headerMenuProp.id ? { ...p, name: rename.trim() } : p)));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
            onClick={() => {
              void saveView({
                ...view.config,
                sorts: [{ propertyId: headerMenuProp.id, dir: "asc" }],
              });
              setHeaderMenu(null);
            }}
          >
            昇順
          </button>
          <button
            className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
            onClick={() => {
              void saveView({
                ...view.config,
                sorts: [{ propertyId: headerMenuProp.id, dir: "desc" }],
              });
              setHeaderMenu(null);
            }}
          >
            降順
          </button>
          {headerMenuProp.type === "formula" && (
            <input
              className="mb-1 h-8 w-full rounded-[6px] bg-canvas px-2 text-[13px] outline-none"
              defaultValue={headerMenuProp.expression ?? ""}
              placeholder="{名前} や {プロパティ名}"
              onBlur={(e) => {
                const expression = e.target.value;
                if (expression !== (headerMenuProp.expression ?? "")) {
                  void saveSchema(
                    schema.map((p) => (p.id === headerMenuProp.id ? { ...p, expression } : p)),
                  );
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {headerMenuProp.type !== "title" && (
            <button
              className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-hover"
              onClick={() => {
                void saveSchema(schema.filter((p) => p.id !== headerMenuProp.id));
                setHeaderMenu(null);
              }}
            >
              削除
            </button>
          )}
        </FloatMenu>
      )}

      {addView && (
        <FloatMenu anchor={addView} onClose={() => setAddView(null)} width={200}>
          {(["table", "board", "calendar", "gallery"] as const).map((t) => (
            <button
              key={t}
              className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
              onClick={async () => {
                const d = await api<{ id: string }>(`/api/pages/${pageId}/views`, {
                  method: "POST",
                  body: JSON.stringify({ type: t }),
                });
                setAddView(null);
                await onChanged();
                setViewId(d.id);
              }}
            >
              {t === "table" ? "テーブル" : t === "board" ? "ボード" : t === "calendar" ? "カレンダー" : "ギャラリー"}
            </button>
          ))}
        </FloatMenu>
      )}

      {addProp && (
        <FloatMenu anchor={addProp} onClose={() => setAddProp(null)} width={220}>
          <p className="px-2 py-1.5 text-[11px] font-medium text-muted">プロパティを追加</p>
          {PROPERTY_TYPES.map((t) => (
            <button
              key={t.type}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
              onClick={() => {
                const prop = createProperty(t.type);
                if (t.type === "relation") prop.databaseId = pageId;
                void saveSchema([...schema, prop]);
                setAddProp(null);
              }}
            >
              <PropertyIcon type={t.type} />
              {t.name}
            </button>
          ))}
        </FloatMenu>
      )}

      {filterMenu && statusProp && (
        <FloatMenu anchor={filterMenu} onClose={() => setFilterMenu(null)} width={220}>
          <button
            className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover"
            onClick={() => {
              setEqualsFilter(null);
              setFilterMenu(null);
            }}
          >
            すべて
          </button>
          {(statusProp.options ?? []).map((o) => (
            <button
              key={o.id}
              className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left hover:bg-hover"
              onClick={() => {
                setEqualsFilter({ propertyId: statusProp.id, value: o.id });
                setFilterMenu(null);
              }}
            >
              <span className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(o.color)}`}>{o.name}</span>
            </button>
          ))}
        </FloatMenu>
      )}
    </div>
  );
}
