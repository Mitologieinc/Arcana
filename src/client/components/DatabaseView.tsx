import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CalendarDays, ChevronRight, Columns3, CreditCard, GripVertical, LayoutGrid, MoreHorizontal, Plus, Search, Table2, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { computePosition, dropEdgeFromY, reorderIds, type DropEdge } from "../lib/dnd";
import { useIsMobile } from "../lib/media";
import type { DbFilter, DbProperty, DbView, Member, Page } from "../lib/types";
import { CoverVisual } from "../lib/covers";
import { FloatMenu } from "./FloatMenu";
import { PageIcon } from "./PageIcon";
import { CalendarView } from "./CalendarView";
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

function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

function applySorts(
  rows: Page[],
  schema: DbProperty[],
  sorts: DbView["config"]["sorts"],
  rowOrder?: Record<string, number>,
) {
  if (!sorts?.length) {
    return [...rows].sort((a, b) => (rowOrder?.[a.id] ?? a.position) - (rowOrder?.[b.id] ?? b.position));
  }
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

function hasPropValue(value: unknown) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function RowChips({
  schema,
  props,
  skipId,
  limit = 4,
  members = [],
}: {
  schema: DbProperty[];
  props: Record<string, unknown>;
  skipId?: string;
  limit?: number;
  members?: Member[];
}) {
  const extras = schema.filter((p) => p.type !== "title" && p.id !== skipId && hasPropValue(props[p.id])).slice(0, limit);
  if (!extras.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {extras.map((p) => {
        if (p.type === "multi_select") {
          const ids = Array.isArray(props[p.id]) ? (props[p.id] as string[]) : [];
          return ids.map((id) => {
            const current = p.options?.find((o) => o.id === id);
            if (!current) return null;
            return (
              <span key={`${p.id}-${id}`} className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(current.color)}`}>
                {current.name}
              </span>
            );
          });
        }
        if (p.type === "select" || p.type === "status") {
          const current = p.options?.find((o) => o.id === String(props[p.id] ?? ""));
          if (!current) return null;
          return (
            <span key={p.id} className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(current.color)}`}>
              {current.name}
            </span>
          );
        }
        if (p.type === "checkbox") {
          return (
            <span key={p.id} className="text-[12px] text-muted">
              {p.name}: {props[p.id] ? "済" : "未"}
            </span>
          );
        }
        if (p.type === "person") {
          const id = String(props[p.id] ?? "");
          const name = members.find((m) => m.userId === id)?.name;
          return (
            <span key={p.id} className="text-[12px] text-muted">
              {name ?? (id ? "退会したメンバー" : p.name)}
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
  );
}

function createProperty(type: Exclude<DbProperty["type"], "title">): DbProperty {
  const found = PROPERTY_TYPES.find((t) => t.type === type);
  const prop: DbProperty = {
    id: crypto.randomUUID().slice(0, 8),
    type,
    name: found?.name ?? "プロパティ",
  };
  if (type === "select" || type === "multi_select") prop.options = [];
  if (type === "status") {
    prop.options = [
      { id: "todo", name: "未着手", color: "gray" },
      { id: "doing", name: "進行中", color: "blue" },
      { id: "done", name: "完了", color: "green" },
    ];
  }
  if (type === "formula") prop.expression = "{title}";
  return prop;
}

function ColumnHeader({
  prop,
  editable,
  renaming,
  rename,
  onRenameChange,
  onStartRename,
  onCommit,
  onCancel,
  onOpenMenu,
}: {
  prop: DbProperty;
  editable: boolean;
  renaming: boolean;
  rename: string;
  onRenameChange: (value: string) => void;
  onStartRename: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onOpenMenu: (rect: DOMRect) => void;
}) {
  if (editable && renaming) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-muted">
        <button
          type="button"
          className="shrink-0 rounded-[4px] p-0.5 hover:bg-hover"
          title="プロパティ"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onCommit();
            onOpenMenu(e.currentTarget.getBoundingClientRect());
          }}
        >
          <PropertyIcon type={prop.type} />
        </button>
        <input
          autoFocus
          className="h-7 min-w-0 flex-1 rounded-[4px] bg-white px-1.5 text-[13px] font-medium text-ink outline-none ring-1 ring-[#2383e2]/50"
          value={rename}
          placeholder="列名"
          onChange={(e) => onRenameChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        className="shrink-0 rounded-[4px] p-0.5 text-muted hover:bg-hover"
        title="プロパティ"
        disabled={!editable}
        onClick={(e) => {
          e.stopPropagation();
          if (!editable) return;
          onOpenMenu(e.currentTarget.getBoundingClientRect());
        }}
      >
        <PropertyIcon type={prop.type} />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate rounded-[4px] px-0.5 text-left text-[13px] text-muted hover:bg-hover"
        disabled={!editable}
        onClick={() => {
          if (!editable) return;
          onStartRename();
        }}
      >
        {prop.name}
      </button>
    </div>
  );
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
  const isMobile = useIsMobile();
  const gutter = embedded ? "" : "px-24 max-[860px]:px-6 max-[720px]:px-4";
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
  const [moreDb, setMoreDb] = useState<DOMRect | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [rename, setRename] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const skipRenameBlur = useRef(false);
  const [moveRow, setMoveRow] = useState<Page | null>(null);
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
      view?.config.rowOrder,
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

  function startRename(prop: DbProperty) {
    skipRenameBlur.current = false;
    setHeaderMenu(null);
    setRenamingId(prop.id);
    setRename(prop.name);
  }

  function cancelRename() {
    skipRenameBlur.current = true;
    setRenamingId(null);
  }

  function commitRename() {
    if (skipRenameBlur.current) {
      skipRenameBlur.current = false;
      setRenamingId(null);
      return;
    }
    const id = renamingId;
    const prop = id ? schema.find((p) => p.id === id) : null;
    const next = rename.trim();
    setRenamingId(null);
    if (!id || !prop || !next || next === prop.name) return;
    void saveSchema(schema.map((p) => (p.id === id ? { ...p, name: next } : p)));
  }

  async function addRow(init?: string | { groupValue?: string; date?: string; datePropId?: string }) {
    const opts = typeof init === "string" ? { groupValue: init } : init ?? {};
    const properties: Record<string, unknown> = {};
    const groupId =
      schema.find((p) => p.id === (view?.config.groupBy ?? "status"))?.id ??
      schema.find((p) => p.type === "select" || p.type === "status")?.id ??
      view?.config.groupBy ??
      "status";
    if (opts.groupValue) properties[groupId] = opts.groupValue;
    const datePropId = opts.datePropId ?? schema.find((p) => p.type === "date")?.id;
    if (opts.date && datePropId) properties[datePropId] = opts.date;
    const res = await api<{ page: Page }>("/api/pages", {
      method: "POST",
      body: JSON.stringify({ parentId: pageId, type: "page", title: "", properties }),
    });
    await onChanged();
    if (isMobile || view?.type === "calendar") onOpenRow(res.page.id);
    else setEditingTitleId(res.page.id);
    return res.page;
  }

  async function addCalendarRow(iso?: string) {
    let dateProp = schema.find((p) => p.type === "date");
    if (!dateProp) {
      dateProp = { id: crypto.randomUUID().slice(0, 8), type: "date", name: "日付" };
      await saveSchema([...schema, dateProp]);
    }
    const date = iso ?? localIso();
    const [y, m] = date.split("-").map(Number);
    if (y && m) setCalCursor({ y, m: m - 1 });
    await addRow({ date, datePropId: dateProp.id });
  }

  async function updateRow(
    row: Page,
    patch: { title?: string; properties?: Record<string, unknown>; position?: number },
  ) {
    try {
      await api(`/api/pages/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: patch.title ?? row.title,
          properties: patch.properties ?? parseProps(row.properties),
          position: patch.position,
          ifUpdatedAt: row.updatedAt,
        }),
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "更新できませんでした");
      await onChanged();
      return false;
    }
    await onChanged();
    return true;
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
    const nextProps = { [statusProp.id]: colStatus ?? "" };
    const order = view.config.rowOrder;
    const colRows = rows
      .filter((r) => {
        if (r.id === row.id) return true;
        const raw = String(parseProps(r.properties)[statusProp.id] ?? "");
        return colStatus ? raw === colStatus : !raw;
      })
      .map((r) => ({ ...r, position: order?.[r.id] ?? r.position }))
      .sort((a, b) => a.position - b.position);
    const position = computePosition(colRows, current.id, current.overId, current.overId ? current.edge : "after");
    endDrag();
    if (await updateRow(row, { properties: nextProps })) {
      await saveView({ ...view.config, rowOrder: { ...order, [row.id]: position } });
    }
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
    const order = view.config.rowOrder;
    const ordered = [...rows]
      .map((r) => ({ ...r, position: order?.[r.id] ?? r.position }))
      .sort((a, b) => a.position - b.position);
    const position = computePosition(ordered, current.id, current.overId, current.edge);
    endDrag();
    await saveView({ ...view.config, rowOrder: { ...order, [row.id]: position } });
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
          placeholder="名前を入力"
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
                const groupId =
                  statusProp?.id ?? view?.config.groupBy ?? "status";
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
          <span className="inline-flex items-center gap-1">
            {row.icon ? <PageIcon icon={row.icon} size={14} /> : null}
            {row.title || (editable ? "名前を入力" : "無題")}
          </span>
        </button>
        {editable && <span className="hidden shrink-0 text-[12px] text-muted group-hover/title:inline">開く</span>}
      </div>
    );
  }

  const headerMenuProp = headerMenu ? schema.find((p) => p.id === headerMenu.id) : null;

  return (
    <div className="mt-3">
      {(editable || views.length > 1) && (
      <div className={`arcana-db-toolbar flex items-center gap-1 ${embedded ? "is-embedded" : ""} ${gutter}`}>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {views.map((v) => (
          <button
            key={v.id}
            className={`arcana-db-tab shrink-0 ${v.id === view.id ? "is-on" : ""}`}
            onClick={() => setViewId(v.id)}
          >
            {v.type === "board" ? (
              <Columns3 size={14} />
            ) : v.type === "calendar" ? (
              <CalendarDays size={14} />
            ) : v.type === "gallery" ? (
              <LayoutGrid size={14} />
            ) : v.type === "card" ? (
              <CreditCard size={14} />
            ) : (
              <Table2 size={14} />
            )}
            {v.name}
          </button>
        ))}
        {editable && (searchOpen ? (
          <input
            autoFocus
            className="ml-1 h-9 min-w-[8rem] flex-1 rounded-md border-none bg-transparent px-2 text-[16px] outline-none placeholder:text-muted hover:bg-hover focus:bg-hover"
            placeholder="検索"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onBlur={() => {
              if (!filterValue) setSearchOpen(false);
            }}
          />
        ) : (
          <button
            className="btn-ghost ml-1 h-9 w-9 shrink-0 p-0 text-muted"
            title="検索"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={15} />
          </button>
        ))}
        {editable && statusProp && !equalsFilter && (
          <button
            className="h-9 shrink-0 rounded-[6px] px-2.5 text-[13px] text-muted hover:bg-hover"
            onClick={(e) => setFilterMenu(e.currentTarget.getBoundingClientRect())}
          >
            絞り込み
          </button>
        )}
        {equalsFilter && statusProp && (
          <button
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-hover px-2.5 text-[13px]"
            onClick={() => setEqualsFilter(null)}
          >
            {statusProp.options?.find((o) => o.id === equalsFilter.value)?.name ?? "絞り込み"}
            <X size={12} />
          </button>
        )}
        {editable && !isMobile && (
          <button
            className="btn-ghost h-9 w-9 shrink-0 p-0 text-muted"
            title="ビューを追加"
            onClick={(e) => setAddView(e.currentTarget.getBoundingClientRect())}
          >
            <Plus size={15} />
          </button>
        )}
        {editable && views.length > 1 && !isMobile && (
          <button
            className="btn-ghost h-8 w-8 shrink-0 p-0 text-muted"
            title="このビューを削除"
            onClick={() => void api(`/api/views/${view.id}`, { method: "DELETE" }).then(onChanged)}
          >
            <Trash2 size={14} />
          </button>
        )}
        {editable && isMobile && (
          <button
            className="btn-ghost h-9 w-9 shrink-0 p-0 text-muted"
            title="その他"
            onClick={(e) => setMoreDb(e.currentTarget.getBoundingClientRect())}
          >
            <MoreHorizontal size={16} />
          </button>
        )}
        </div>
        {editable && (
          <button
            type="button"
            className="arcana-db-new ml-1 shrink-0"
            onClick={() => void (view.type === "calendar" ? addCalendarRow() : addRow())}
          >
            新規
          </button>
        )}
      </div>
      )}

      {isMobile && view.type === "table" ? (
        <div className={`${gutter} pb-8`}>
          <ul className="arcana-db-list divide-y divide-line">
            {filtered.map((row) => {
              const props = parseProps(row.properties);
              return (
                <li key={row.id} className="flex items-center gap-2 px-3 py-2.5 active:bg-hover">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpenRow(row.id)}
                  >
                    <span className={`flex items-center gap-1.5 text-[15px] ${row.title ? "" : "text-muted"}`}>
                      {row.icon ? <PageIcon icon={row.icon} size={16} /> : null}
                      <span className="truncate">{row.title || (editable ? "名前を入力" : "無題")}</span>
                    </span>
                    <RowChips schema={schema} props={props} skipId={editable ? statusProp?.id : undefined} limit={3} members={members} />
                  </button>
                  {editable && statusProp && (
                    <div className="w-[7.5rem] shrink-0">
                      <PropertyValue
                        dense
                        property={statusProp}
                        value={props[statusProp.id]}
                        editable={editable}
                        members={members}
                        pages={pages.length ? pages : rows}
                        title={row.title}
                        schema={schema}
                        allProps={props}
                        onChange={(v) => void updateRow(row, { properties: { [statusProp.id]: v } })}
                        onUpdateOptions={(options) =>
                          void saveSchema(schema.map((s) => (s.id === statusProp.id ? { ...s, options } : s)))
                        }
                      />
                    </div>
                  )}
                  {editable && <ChevronRight size={16} className="shrink-0 text-[#c4c2bc]" />}
                </li>
              );
            })}
          </ul>
          {filtered.length === 0 && (
            <p className="px-1 py-8 text-center text-[13px] leading-relaxed text-muted">
              {equalsFilter || filterValue ? "条件に合う行はありません" : "まだありません"}
            </p>
          )}
          {editable && (
            <button
              type="button"
              className="mt-3 flex h-11 w-full items-center justify-center rounded-[10px] border border-dashed border-line text-[14px] text-muted active:bg-hover"
              onClick={() => void addRow()}
            >
              + 行を追加
            </button>
          )}
        </div>
      ) : view.type === "card" ? (
        <div className={`grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 max-[720px]:grid-cols-1 ${gutter}`}>
          {filtered.map((row) => {
            const props = parseProps(row.properties);
            return (
              <button
                key={row.id}
                type="button"
                className="arcana-db-tile"
                onClick={() => onOpenRow(row.id)}
              >
                {row.coverR2Key && (
                  <div className="h-28 bg-canvas">
                    <CoverVisual cover={row.coverR2Key} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-3.5">
                  <div className={`flex items-center gap-1.5 text-[15px] font-medium ${row.title ? "" : "text-muted"}`}>
                    {row.icon ? <PageIcon icon={row.icon} size={16} /> : null}
                    <span className="truncate">{row.title || (editable ? "名前を入力" : "無題")}</span>
                  </div>
                  <RowChips schema={schema} props={props} limit={6} members={members} />
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full px-1 py-8 text-center text-[13px] text-muted">
              {equalsFilter || filterValue ? "条件に合う行はありません" : editable ? "カードを追加して、一覧を使い始めてください" : "まだありません"}
            </p>
          )}
          {editable && (
            <button
              type="button"
              className="rounded border border-dashed border-line px-3 py-8 text-[13px] text-muted hover:bg-hover"
              onClick={() => void addRow()}
            >
              + カードを追加
            </button>
          )}
        </div>
      ) : view.type === "gallery" ? (
        <div className={`grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 max-[720px]:grid-cols-2 ${gutter}`}>
          {filtered.map((row) => (
            <button
              key={row.id}
              className="arcana-db-tile max-[720px]:min-h-[9.5rem]"
              onClick={() => onOpenRow(row.id)}
            >
              <div className="h-24 bg-canvas">
                {row.coverR2Key && <CoverVisual cover={row.coverR2Key} className="h-full w-full object-cover" />}
              </div>
              <div className="flex items-center gap-1 px-3 py-2 text-[14px]">
                {row.icon ? <PageIcon icon={row.icon} size={14} /> : null}
                {row.title || "無題"}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full px-1 py-8 text-center text-[13px] text-muted">
              {equalsFilter || filterValue ? "条件に合う行はありません" : editable ? "カードを追加して、ギャラリーを使い始めてください" : "まだありません"}
            </p>
          )}
          {editable && (
            <button className="rounded border border-dashed border-line px-3 py-8 text-[13px] text-muted hover:bg-hover" onClick={() => void addRow()}>
              + 新規
            </button>
          )}
        </div>
      ) : view.type === "calendar" ? (
        <div className={gutter}>
          <CalendarView
            rows={filtered}
            dateProp={schema.find((p) => p.type === "date") ?? schema.find((p) => p.id === view.config.groupBy)}
            year={calCursor.y}
            month={calCursor.m}
            editable={editable}
            isMobile={isMobile}
            onMonth={setCalCursor}
            onOpen={onOpenRow}
            onAdd={(iso) => void addCalendarRow(iso)}
            onMoveDate={(row, iso) => {
              const dateProp =
                schema.find((p) => p.type === "date") ?? schema.find((p) => p.id === view.config.groupBy);
              if (!dateProp) return;
              void updateRow(row, { properties: { [dateProp.id]: iso } });
            }}
          />
        </div>
      ) : view.type === "board" && !statusProp ? (
        <div className={`${gutter} py-10 text-center`}>
          <p className="mb-3 text-[13px] text-muted">ボードにはステータス列が必要です</p>
          {editable && (
            <button
              type="button"
              className="btn btn-secondary h-8 px-3 text-[13px]"
              onClick={() => {
                const prop = createProperty("status");
                void saveSchema([...schema, prop]).then(() => {
                  void saveView({ ...view.config, groupBy: prop.id });
                });
              }}
            >
              ステータス列を追加
            </button>
          )}
        </div>
      ) : view.type === "board" && statusProp ? (
        <div className={gutter}>
          {(() => {
            const options = statusProp.options ?? [];
            const known = new Set(options.map((o) => o.id));
            const columns: { id: string; name: string; color?: string; status?: string }[] = [
              { id: "__empty__", name: "ステータスなし" },
              ...options.map((o) => ({ id: o.id, name: o.name, color: o.color, status: o.id })),
            ];
            return (
              <>
                {isMobile && (
                  <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                    {columns.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        className="h-8 shrink-0 rounded-full bg-canvas px-3 text-[13px] text-muted active:bg-hover"
                        onClick={() =>
                          colRefs.current[col.id]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
                        }
                      >
                        {col.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="arcana-board flex gap-3 overflow-x-auto pb-2">
            {columns.map((col) => {
              const colRows = filtered.filter((r) => {
                const raw = String(parseProps(r.properties)[statusProp.id] ?? "");
                if (col.id === "__empty__") return !raw || !known.has(raw);
                return raw === col.id;
              });
              if (col.id === "__empty__" && colRows.length === 0) return null;
              return (
                <div
                  key={col.id}
                  ref={(el) => {
                    colRefs.current[col.id] = el;
                  }}
                  className={`arcana-board-col w-[260px] shrink-0 p-2.5 ${
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
                    return (
                      <div
                        key={row.id}
                        data-card
                        draggable={editable && !isMobile && editingTitleId !== row.id}
                        onDragStart={(e) => beginDrag(e, "card", row.id)}
                        onDragOver={(e) => hoverDrag(e, row.id, col.id)}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void commitCardDrop(col.status);
                        }}
                        onDragEnd={(e) => endDrag(e)}
                        className={`arcana-board-card relative mb-2 cursor-pointer p-3 text-left max-[720px]:p-3.5 ${
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
                          <div className={`text-[15px] ${row.title ? "" : "text-muted"}`}>{row.title || "無題"}</div>
                        )}
                        {editingTitleId !== row.id && (
                          <RowChips schema={schema} props={props} skipId={statusProp.id} members={members} />
                        )}
                        {editable && isMobile && editingTitleId !== row.id && (
                          <button
                            type="button"
                            className="mt-2 text-[12px] text-muted"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMoveRow(row);
                            }}
                          >
                            列を移動
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {editable && (
                    <button
                      className="w-full rounded-md px-1.5 py-1.5 text-left text-[13px] text-muted hover:bg-hover max-[720px]:min-h-11 max-[720px]:px-2"
                      onClick={() => void addRow(col.status)}
                    >
                      + 新規
                    </button>
                  )}
                </div>
              );
            })}
                </div>
                {moveRow && (
                  <div
                    className="fixed inset-0 z-40 bg-[rgba(15,15,15,0.28)]"
                    onClick={() => setMoveRow(null)}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-t-[16px] bg-white p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="px-2 pb-2 text-[13px] font-medium">移動先</p>
                      {columns.map((col) => (
                        <button
                          key={col.id}
                          type="button"
                          className="flex min-h-11 w-full items-center rounded-[8px] px-2 text-left text-[15px] active:bg-hover"
                          onClick={() => {
                            const row = moveRow;
                            setMoveRow(null);
                            void updateRow(row, {
                              properties: { [statusProp.id]: col.status ?? "" },
                            });
                          }}
                        >
                          {col.color ? (
                            <span className={`rounded-[4px] px-1.5 py-0.5 text-[13px] ${optionClass(col.color)}`}>
                              {col.name}
                            </span>
                          ) : (
                            col.name
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <div className={gutter}>
        <div className="arcana-db-frame">
          <table className="arcana-db-table">
            <thead>
              <tr>
                <th>
                  {titleProp && (
                    <ColumnHeader
                      prop={titleProp}
                      editable={editable}
                      renaming={renamingId === titleProp.id}
                      rename={rename}
                      onRenameChange={setRename}
                      onStartRename={() => startRename(titleProp)}
                      onCommit={commitRename}
                      onCancel={cancelRename}
                      onOpenMenu={(rect) => {
                        setRenamingId(null);
                        setRename(titleProp.name);
                        setHeaderMenu({ id: titleProp.id, rect });
                      }}
                    />
                  )}
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
                    draggable={editable && renamingId !== p.id}
                    onDragStart={(e) => {
                      if ((e.target as HTMLElement).closest("input")) {
                        e.preventDefault();
                        return;
                      }
                      beginDrag(e, "col", p.id);
                    }}
                    onDragOver={(e) => hoverDrag(e, p.id)}
                    onDrop={(e) => {
                      e.preventDefault();
                      void commitColDrop();
                    }}
                    onDragEnd={(e) => endDrag(e)}
                  >
                    <ColumnHeader
                      prop={p}
                      editable={editable}
                      renaming={renamingId === p.id}
                      rename={rename}
                      onRenameChange={setRename}
                      onStartRename={() => startRename(p)}
                      onCommit={commitRename}
                      onCancel={cancelRename}
                      onOpenMenu={(rect) => {
                        setRenamingId(null);
                        setRename(p.name);
                        setHeaderMenu({ id: p.id, rect });
                      }}
                    />
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={Math.max(1, dataProps.length + (editable ? 2 : 1))} className="!border-0">
                    <p className="px-6 py-10 text-center text-[13px] text-muted">
                      {equalsFilter || filterValue ? "条件に合う行はありません" : editable ? "行を追加して、表を使い始めてください" : "まだありません"}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((row) => {
                const props = parseProps(row.properties);
                return (
                  <tr
                    key={row.id}
                    className={`group cursor-pointer ${
                      drag?.type === "row" && drag.id === row.id ? "opacity-40" : ""
                    } ${
                      drag?.type === "row" && drag.overId === row.id
                        ? drag.edge === "before"
                          ? "arcana-drop-before"
                          : "arcana-drop-after"
                        : ""
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("input, select, textarea, button, [data-stop-row]")) return;
                      onOpenRow(row.id);
                    }}
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
                            className="arcana-grip opacity-0 group-hover:opacity-100"
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
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteRow(row.id);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                    {dataProps.map((p) => (
                      <td key={p.id} {...(editable ? { "data-stop-row": true } : {})}>
                        <PropertyValue
                          property={p}
                          value={props[p.id]}
                          editable={editable}
                          members={members}
                          pages={pages.length ? pages : rows}
                          title={row.title}
                          schema={schema}
                          allProps={props}
                          onChange={(v) => void updateRow(row, { properties: { [p.id]: v } })}
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
        </div>
      )}

      {headerMenu && headerMenuProp && (
        <FloatMenu
          anchor={headerMenu.rect}
          onClose={() => setHeaderMenu(null)}
          width={220}
        >
          <input
            autoFocus
            className="mb-1 h-8 w-full rounded-[6px] bg-canvas px-2 text-[13px] outline-none"
            value={rename}
            placeholder="列名"
            onChange={(e) => setRename(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
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
              placeholder="{title} や {列名}"
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

      {moreDb && (
        <FloatMenu anchor={moreDb} onClose={() => setMoreDb(null)} width={220}>
          <button
            className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
            onClick={() => {
              const rect = moreDb;
              setMoreDb(null);
              if (rect) setAddProp(rect);
            }}
          >
            プロパティを追加
          </button>
          <button
            className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
            onClick={() => {
              const rect = moreDb;
              setMoreDb(null);
              if (rect) setAddView(rect);
            }}
          >
            ビューを追加
          </button>
          {views.length > 1 && (
            <button
              className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-hover"
              onClick={() => {
                setMoreDb(null);
                void api(`/api/views/${view.id}`, { method: "DELETE" }).then(onChanged);
              }}
            >
              このビューを削除
            </button>
          )}
        </FloatMenu>
      )}

      {addView && (
        <FloatMenu anchor={addView} onClose={() => setAddView(null)} width={200}>
          {(["table", "board", "card", "calendar", "gallery"] as const).map((t) => (
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
              {t === "table" ? "テーブル" : t === "board" ? "ボード" : t === "card" ? "カード" : t === "calendar" ? "カレンダー" : "ギャラリー"}
            </button>
          ))}
          {isMobile && editable && views.length > 1 && (
            <button
              className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-hover"
              onClick={() => {
                setAddView(null);
                void api(`/api/views/${view.id}`, { method: "DELETE" }).then(onChanged);
              }}
            >
              このビューを削除
            </button>
          )}
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
                setAddProp(null);
                void saveSchema([...schema, prop]).then(() => {
                  setRenamingId(prop.id);
                  setRename(prop.name);
                });
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
