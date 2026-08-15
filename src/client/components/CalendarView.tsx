import { useMemo, useRef, useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import type { DbProperty, Page } from "../lib/types";
import { PageIcon } from "./PageIcon";
import { parseProps } from "./PropertyValue";

function EventLabel({ row, size = 14 }: { row: Page; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {row.icon ? <PageIcon icon={row.icon} size={size} /> : null}
      <span className="truncate">{row.title || "無題"}</span>
    </span>
  );
}

const WEEK_MON = ["月", "火", "水", "木", "金", "土", "日"];
const WEEK_SUN = ["日", "月", "火", "水", "木", "金", "土"];

function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayJa(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEK_SUN[new Date(y, m - 1, d).getDay()];
}

function dateValue(row: Page, dateProp?: DbProperty | null) {
  if (!dateProp) return "";
  return String(parseProps(row.properties)[dateProp.id] ?? "");
}

export function CalendarView({
  rows,
  dateProp,
  year,
  month,
  editable,
  isMobile,
  onMonth,
  onOpen,
  onAdd,
  onMoveDate,
}: {
  rows: Page[];
  dateProp?: DbProperty | null;
  year: number;
  month: number;
  editable: boolean;
  isMobile: boolean;
  onMonth: (next: { y: number; m: number }) => void;
  onOpen: (id: string) => void;
  onAdd: (iso: string) => void;
  onMoveDate: (row: Page, iso: string) => void;
}) {
  const today = localIso();
  const [pick, setPick] = useState(today);
  const [overIso, setOverIso] = useState<string | null>(null);
  const dragged = useRef(false);
  const thisMonth = today.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`);

  const { cells, undated, agenda } = useMemo(() => {
    const start = new Date(year, month, 1);
    const startPad = (start.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const filled = startPad + days;
    const trailing = (7 - (filled % 7)) % 7;
    const cells = [...Array(filled + trailing)].map((_, i) => {
      if (i < startPad || i >= filled) return null;
      const day = i - startPad + 1;
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayRows = rows.filter((r) => dateValue(r, dateProp) === iso);
      return { day, iso, dayRows };
    });
    const undated = rows.filter((r) => !dateValue(r, dateProp));
    const agenda = cells.filter((c) => c && (c.iso === today || c.dayRows.length > 0));
    return { cells, undated, agenda };
  }, [rows, dateProp, year, month, today]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    onMonth({ y: d.getFullYear(), m: d.getMonth() });
  }

  function dropOn(iso: string, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/plain");
    const row = rows.find((r) => r.id === id);
    if (row && dateValue(row, dateProp) !== iso) onMoveDate(row, iso);
    setOverIso(null);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <button type="button" className="btn-ghost h-8 px-2 text-[13px] text-muted" onClick={() => shift(-1)}>
          ←
        </button>
        <p className="min-w-[7.5rem] text-center text-[14px] font-medium">
          {year}年{month + 1}月
        </p>
        <button type="button" className="btn-ghost h-8 px-2 text-[13px] text-muted" onClick={() => shift(1)}>
          →
        </button>
        {!thisMonth && (
          <button
            type="button"
            className="btn-ghost ml-1 h-8 px-2.5 text-[13px] text-muted"
            onClick={() => {
              const n = new Date();
              onMonth({ y: n.getFullYear(), m: n.getMonth() });
            }}
          >
            今日
          </button>
        )}
      </div>

      {isMobile ? (
        <div className="space-y-3">
          {editable && (
            <div className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2">
              <input
                type="date"
                className="input h-9 min-w-0 flex-1 text-[16px]"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              />
              <button type="button" className="btn btn-primary h-9 shrink-0 px-3 text-[13px]" onClick={() => onAdd(pick || today)}>
                追加
              </button>
            </div>
          )}
          <ul className="arcana-db-list divide-y divide-line">
            {agenda.length === 0 && (
              <li className="px-3 py-8 text-center text-[13px] text-muted">この月の予定はありません</li>
            )}
            {agenda.map((cell) => {
              if (!cell) return null;
              const isToday = cell.iso === today;
              return (
                <li key={cell.iso} className={`px-3 py-2.5 ${isToday ? "bg-canvas" : ""}`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className={`text-[13px] font-medium ${isToday ? "text-ink" : "text-muted"}`}>
                      {month + 1}/{cell.day}
                      <span className="ml-1 font-normal text-muted">（{weekdayJa(cell.iso)}）</span>
                      {isToday ? <span className="ml-1 text-[11px] text-cf">今日</span> : null}
                    </p>
                    {editable && (
                      <button type="button" className="text-[13px] text-muted" onClick={() => onAdd(cell.iso)}>
                        + 追加
                      </button>
                    )}
                  </div>
                  {cell.dayRows.length === 0 && (
                    <p className="py-1 text-[13px] text-muted">まだありません</p>
                  )}
                  {cell.dayRows.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="flex min-h-10 w-full items-center rounded-[6px] px-1 text-left text-[15px] active:bg-hover"
                      onClick={() => onOpen(r.id)}
                    >
                      <EventLabel row={r} size={16} />
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="arcana-db-frame">
          <div className="grid grid-cols-7 border-b border-line bg-canvas">
            {WEEK_MON.map((d, i) => (
              <div
                key={d}
                className={`px-2 py-1.5 text-[11px] ${i >= 5 ? "text-[#c4c2bc]" : "text-muted"}`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 bg-line" style={{ gap: 1 }}>
            {cells.map((cell, i) => (
              <div
                key={cell?.iso ?? `pad-${i}`}
                className={`group/day min-h-[7.5rem] bg-white p-1.5 ${
                  cell?.iso === today ? "bg-canvas" : ""
                } ${overIso && cell?.iso === overIso ? "outline outline-2 outline-[#2383e2]/50 outline-offset-[-2px]" : ""}`}
                onDragOver={(e) => {
                  if (!editable || !cell) return;
                  e.preventDefault();
                  setOverIso(cell.iso);
                }}
                onDragLeave={() => setOverIso((cur) => (cur === cell?.iso ? null : cur))}
                onDrop={(e) => cell && dropOn(cell.iso, e)}
              >
                {cell && (
                  <>
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={
                          cell.iso === today
                            ? "flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-medium text-white"
                            : `text-[12px] ${i % 7 >= 5 ? "text-[#c4c2bc]" : "text-muted"}`
                        }
                      >
                        {cell.day}
                      </span>
                      {editable && (
                        <button
                          type="button"
                          className="flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 hover:bg-hover hover:text-ink group-hover/day:opacity-100"
                          aria-label={`${month + 1}月${cell.day}日に追加`}
                          onClick={() => onAdd(cell.iso)}
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex max-h-[5.5rem] flex-col gap-0.5 overflow-auto">
                      {cell.dayRows.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          draggable={editable}
                          className="flex w-full items-center truncate rounded-[5px] bg-canvas px-1.5 py-0.5 text-left text-[12px] hover:bg-hover"
                          onClick={() => {
                            if (dragged.current) {
                              dragged.current = false;
                              return;
                            }
                            onOpen(r.id);
                          }}
                          onDragStart={(e) => {
                            dragged.current = true;
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", r.id);
                          }}
                          onDragEnd={() => {
                            window.setTimeout(() => {
                              dragged.current = false;
                            }, 0);
                          }}
                        >
                          <EventLabel row={r} size={12} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-medium text-muted">日付なし</p>
          <ul className="flex flex-wrap gap-1.5">
            {undated.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="inline-flex items-center rounded-[6px] bg-canvas px-2 py-1 text-left text-[13px] hover:bg-hover"
                  onClick={() => onOpen(r.id)}
                  draggable={editable && !isMobile}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", r.id);
                  }}
                >
                  <EventLabel row={r} />
                </button>
              </li>
            ))}
          </ul>
          {editable && (
            <p className="mt-1.5 text-[12px] text-muted">
              {isMobile ? "開いて日付を付けるとカレンダーに出ます" : "カレンダーへドラッグすると日付が付きます"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
