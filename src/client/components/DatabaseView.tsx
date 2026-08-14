import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { DbFilter, DbProperty, DbView, Page } from "../lib/types";
import { parseProps, PropertyValue } from "./PropertyValue";

type Props = {
  pageId: string;
  schema: DbProperty[];
  views: DbView[];
  rows: Page[];
  editable: boolean;
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

export function DatabaseView({
  pageId,
  schema,
  views,
  rows,
  editable,
  onOpenRow,
  onChanged,
}: Props) {
  const [viewId, setViewId] = useState(views[0]?.id);
  const view = views.find((v) => v.id === viewId) ?? views[0];
  const [filterValue, setFilterValue] = useState("");
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipTitleBlur = useRef(false);

  const filtered = useMemo(() => {
    const extra: DbFilter[] = filterValue
      ? [{ propertyId: "title", op: "contains", value: filterValue }]
      : [];
    return applyFilters(rows, schema, [...(view?.config.filters ?? []), ...extra]);
  }, [rows, schema, view, filterValue]);

  useEffect(() => {
    if (editingTitleId) titleInputRef.current?.focus();
  }, [editingTitleId, rows.length]);

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

  async function updateRow(row: Page, patch: { title?: string; properties?: Record<string, unknown> }) {
    await api(`/api/pages/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: patch.title ?? row.title,
        properties: patch.properties ?? parseProps(row.properties),
      }),
    });
    await onChanged();
  }

  if (!view) {
    return <p className="mt-6 text-muted">ビューがありません</p>;
  }

  const statusProp =
    schema.find((p) => p.id === (view.config.groupBy ?? "status")) ??
    schema.find((p) => p.type === "select" || p.type === "status");
  const dataProps = schema.filter((p) => p.type !== "title");

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
      <button
        className={`w-full truncate text-left text-[14px] ${row.title ? "" : "text-muted"}`}
        onClick={() => onOpenRow(row.id)}
      >
        {row.icon ? `${row.icon} ` : ""}
        {row.title || "無題"}
      </button>
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {views.map((v) => (
          <button
            key={v.id}
            className={`h-8 rounded-md px-2.5 text-[13px] ${v.id === view.id ? "bg-hover font-medium text-ink" : "text-muted hover:bg-hover hover:text-ink"}`}
            onClick={() => setViewId(v.id)}
          >
            {v.name}
          </button>
        ))}
        <input
          className="ml-2 h-8 w-40 rounded-md border-none bg-transparent px-2 text-[13px] outline-none placeholder:text-muted hover:bg-hover focus:bg-hover"
          placeholder="検索"
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
        />
        {editable && view.type !== "board" && (
          <button className="btn-ghost ml-auto h-8 px-2.5 text-[13px] text-muted" onClick={() => void addRow()}>
            新規
          </button>
        )}
      </div>

      {view.type === "board" && statusProp ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {(() => {
            const options = statusProp.options ?? [];
            const known = new Set(options.map((o) => o.id));
            const columns: { id: string; name: string; status?: string }[] = [
              { id: "__empty__", name: "ステータスなし" },
              ...options.map((o) => ({ id: o.id, name: o.name, status: o.id })),
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
                  className="w-64 shrink-0 rounded-[10px] bg-canvas p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    const row = rows.find((r) => r.id === id);
                    if (!row || !editable) return;
                    void updateRow(row, {
                      properties: { ...parseProps(row.properties), [statusProp.id]: col.status ?? "" },
                    });
                  }}
                >
                  <div className="mb-2 px-1.5 text-[12px] font-medium text-muted">
                    {col.name}
                    <span className="ml-1.5 text-[#c4c2bc]">{colRows.length}</span>
                  </div>
                  {colRows.map((row) => (
                    <div
                      key={row.id}
                      draggable={editable}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)}
                      className="mb-2 cursor-pointer rounded-[8px] bg-white p-2.5 text-left text-[14px] shadow-[0_1px_2px_rgba(15,15,15,0.06)] hover:bg-[#fafafa]"
                      onClick={() => (editingTitleId === row.id ? undefined : onOpenRow(row.id))}
                    >
                      {editingTitleId === row.id ? (
                        titleCell(row)
                      ) : (
                        <span className={row.title ? "" : "text-muted"}>{row.title || "無題"}</span>
                      )}
                    </div>
                  ))}
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
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-[12px] text-muted">
              <tr>
                <th className="min-w-[220px] border-b border-line px-2 py-2 font-medium">
                  {schema.find((p) => p.type === "title")?.name ?? "名前"}
                </th>
                {dataProps.map((p) => (
                  <th key={p.id} className="min-w-[120px] border-b border-line px-2 py-2 font-medium">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const props = parseProps(row.properties);
                return (
                  <tr key={row.id} className="hover:bg-[rgba(55,53,47,0.03)]">
                    <td className="border-b border-line px-2 py-1.5">{titleCell(row)}</td>
                    {dataProps.map((p) => (
                      <td key={p.id} className="border-b border-line px-2 py-1.5">
                        <PropertyValue
                          property={p}
                          value={props[p.id]}
                          editable={editable}
                          onChange={(v) => void updateRow(row, { properties: { ...props, [p.id]: v } })}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {editable && (
                <tr>
                  <td colSpan={Math.max(dataProps.length + 1, 1)} className="px-1 py-1">
                    <button
                      className="w-full rounded-md px-1 py-1.5 text-left text-[13px] text-muted hover:bg-hover"
                      onClick={() => void addRow()}
                    >
                      + 新規
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
