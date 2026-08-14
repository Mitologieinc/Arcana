import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { DbFilter, DbProperty, DbView, Page } from "../lib/types";

type Props = {
  pageId: string;
  schema: DbProperty[];
  views: DbView[];
  rows: Page[];
  editable: boolean;
  onOpenRow: (id: string) => void;
  onChanged: () => Promise<unknown>;
};

function parseProps(row: Page): Record<string, unknown> {
  if (!row.properties) return {};
  try {
    return JSON.parse(row.properties) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function applyFilters(rows: Page[], schema: DbProperty[], filters: DbFilter[] | undefined) {
  if (!filters?.length) return rows;
  return rows.filter((row) => {
    const props = parseProps(row);
    return filters.every((f) => {
      const prop = schema.find((p) => p.id === f.propertyId);
      const raw =
        prop?.type === "title" ? row.title : String(props[f.propertyId] ?? "");
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
  const [filterProp, setFilterProp] = useState(schema[0]?.id ?? "title");

  const filtered = useMemo(() => {
    const extra: DbFilter[] = filterValue
      ? [{ propertyId: filterProp, op: "contains", value: filterValue }]
      : [];
    return applyFilters(rows, schema, [...(view?.config.filters ?? []), ...extra]);
  }, [rows, schema, view, filterValue, filterProp]);

  async function addRow() {
    await api("/api/pages", {
      method: "POST",
      body: JSON.stringify({
        parentId: pageId,
        type: "page",
        title: "無題",
        properties: { status: "todo" },
      }),
    });
    await onChanged();
  }

  async function updateRow(row: Page, patch: { title?: string; properties?: Record<string, unknown> }) {
    await api(`/api/pages/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: patch.title ?? row.title,
        properties: patch.properties ?? parseProps(row),
      }),
    });
    await onChanged();
  }

  if (!view) {
    return <p className="mt-6 text-muted">ビューがありません</p>;
  }

  const statusProp = schema.find((p) => p.id === (view.config.groupBy ?? "status")) ?? schema.find((p) => p.type === "select");

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {views.map((v) => (
          <button
            key={v.id}
            className={`h-8 px-3 text-[14px] ${v.id === view.id ? "border-b-2 border-cf font-medium" : "text-muted hover:text-ink"}`}
            onClick={() => setViewId(v.id)}
          >
            {v.name}
          </button>
        ))}
        <select
          className="ml-2 rounded border border-line px-2 py-1 text-sm"
          value={filterProp}
          onChange={(e) => setFilterProp(e.target.value)}
        >
          {schema.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="rounded border border-line px-2 py-1 text-sm"
          placeholder="含む…"
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
        />
        {editable && (
          <button className="btn btn-primary ml-auto h-8 px-3 text-[12px]" onClick={addRow}>
            行を追加
          </button>
        )}
      </div>

      {view.type === "board" && statusProp ? (
        <div className="grid auto-cols-fr grid-flow-col gap-3 overflow-x-auto">
          {(statusProp.options ?? []).map((opt) => {
            const colRows = filtered.filter((r) => String(parseProps(r)[statusProp.id] ?? "todo") === opt.id);
            return (
              <div key={opt.id} className="min-w-56 rounded-[8px] bg-canvas p-2">
                <div className="mb-2 px-1 text-[12px] font-medium text-muted">
                  {opt.name} · {colRows.length}
                </div>
                {colRows.map((row) => (
                  <button
                    key={row.id}
                    className="mb-2 w-full rounded-[6px] bg-white p-2.5 text-left text-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-[#fafafa]"
                    onClick={() => onOpenRow(row.id)}
                  >
                    {row.icon} {row.title || "無題"}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-auto rounded-[8px] border border-line">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-[12px] text-muted">
              <tr>
                {schema.map((p) => (
                  <th key={p.id} className="px-3 py-2 font-medium">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const props = parseProps(row);
                return (
                  <tr key={row.id} className="border-t border-line">
                    {schema.map((p) => (
                      <td key={p.id} className="px-3 py-1.5">
                        {p.type === "title" ? (
                          <button className="text-left hover:underline" onClick={() => onOpenRow(row.id)}>
                            {row.icon} {row.title || "無題"}
                          </button>
                        ) : p.type === "select" || p.type === "status" ? (
                          <select
                            disabled={!editable}
                            className="rounded border border-transparent bg-transparent"
                            value={String(props[p.id] ?? "")}
                            onChange={(e) =>
                              updateRow(row, { properties: { ...props, [p.id]: e.target.value } })
                            }
                          >
                            <option value="">—</option>
                            {(p.options ?? []).map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        ) : p.type === "checkbox" ? (
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={Boolean(props[p.id])}
                            onChange={(e) =>
                              updateRow(row, { properties: { ...props, [p.id]: e.target.checked } })
                            }
                          />
                        ) : p.type === "number" ? (
                          <input
                            type="number"
                            disabled={!editable}
                            className="w-24 border-none bg-transparent"
                            defaultValue={String(props[p.id] ?? "")}
                            onBlur={(e) =>
                              updateRow(row, {
                                properties: { ...props, [p.id]: Number(e.target.value) },
                              })
                            }
                          />
                        ) : (
                          <input
                            disabled={!editable}
                            className="w-full border-none bg-transparent"
                            defaultValue={String(props[p.id] ?? "")}
                            onBlur={(e) =>
                              updateRow(row, { properties: { ...props, [p.id]: e.target.value } })
                            }
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
