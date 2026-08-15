import { useRef, useState } from "react";
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  CircleDot,
  Hash,
  Link2,
  List,
  Type,
  User,
} from "lucide-react";
import type { DbProperty, Member, Page, SelectOption } from "../lib/types";
import { evalFormula } from "../lib/formula";
import { FloatMenu } from "./FloatMenu";
import { Avatar } from "./Avatar";
import { PageIcon } from "./PageIcon";

const PILL: Record<string, string> = {
  gray: "bg-[#e3e2de] text-[#37352f]",
  brown: "bg-[#eee0da] text-[#442a1e]",
  orange: "bg-[#fadec9] text-[#49290e]",
  yellow: "bg-[#fdecc8] text-[#402c1b]",
  green: "bg-[#dbeddb] text-[#1c3829]",
  blue: "bg-[#d3e5ef] text-[#183347]",
  purple: "bg-[#e8deee] text-[#412454]",
  pink: "bg-[#f5e0e9] text-[#4c2337]",
  red: "bg-[#ffe2dd] text-[#5d1715]",
};

const OPTION_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "pink", "purple", "brown"];

export function optionClass(color?: string) {
  return PILL[color ?? "gray"] ?? PILL.gray;
}

export function parseProps(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function PropertyIcon({ type, size = 14 }: { type: DbProperty["type"]; size?: number }) {
  const p = { size, className: "shrink-0 text-muted", strokeWidth: 1.75 } as const;
  if (type === "title") return <Type {...p} />;
  if (type === "number") return <Hash {...p} />;
  if (type === "date") return <Calendar {...p} />;
  if (type === "checkbox") return <CheckSquare {...p} />;
  if (type === "select") return <List {...p} />;
  if (type === "multi_select") return <List {...p} />;
  if (type === "status") return <CircleDot {...p} />;
  if (type === "person") return <User {...p} />;
  if (type === "relation") return <Link2 {...p} />;
  if (type === "formula") return <Hash {...p} />;
  return <AlignLeft {...p} />;
}

export const PROPERTY_TYPES: { type: Exclude<DbProperty["type"], "title">; name: string }[] = [
  { type: "text", name: "テキスト" },
  { type: "number", name: "数値" },
  { type: "select", name: "セレクト" },
  { type: "multi_select", name: "マルチセレクト" },
  { type: "status", name: "ステータス" },
  { type: "date", name: "日付" },
  { type: "checkbox", name: "チェックボックス" },
  { type: "person", name: "担当者" },
  { type: "relation", name: "リレーション" },
  { type: "formula", name: "数式" },
];

export function newSelectOption(name: string, existing = 0): SelectOption {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name,
    color: OPTION_COLORS[existing % OPTION_COLORS.length],
  };
}

export function PropertyValue({
  property,
  value,
  editable,
  onChange,
  onUpdateOptions,
  members = [],
  pages = [],
  title = "",
  schema = [],
  allProps = {},
  dense = false,
}: {
  property: DbProperty;
  value: unknown;
  editable: boolean;
  onChange: (next: unknown) => void;
  onUpdateOptions?: (options: SelectOption[]) => void;
  members?: Member[];
  pages?: Page[];
  title?: string;
  schema?: DbProperty[];
  allProps?: Record<string, unknown>;
  dense?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState("");
  const [newOpt, setNewOpt] = useState("");

  function openMenu(el: HTMLElement) {
    if (!editable) return;
    setAnchor(el.getBoundingClientRect());
    setDraft(value == null ? "" : String(value));
    setOpen(true);
  }

  const hit = dense ? "" : "arcana-prop-hit ";

  if (property.type === "formula") {
    const snapshot = value == null ? "" : String(value);
    const shown = evalFormula(property.expression ?? "", { title, schema, values: allProps }, snapshot);
    return <span className="truncate text-[13px] text-muted">{shown || "—"}</span>;
  }

  if (property.type === "person") {
    const current = members.find((m) => m.userId === String(value ?? ""));
    return (
      <>
        <button
          type="button"
          disabled={!editable}
          className={`${hit}flex h-7 w-full items-center rounded-[4px] px-0.5 text-left text-[13px] hover:bg-hover`}
          onClick={(e) => {
            e.stopPropagation();
            openMenu(e.currentTarget);
          }}
        >
          {current ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={current.name} seed={current.userId} size={18} />
              <span className="truncate">{current.name}</span>
            </span>
          ) : value ? (
            <span className="text-muted">退会したメンバー</span>
          ) : (
            <span className="text-muted">未設定</span>
          )}
        </button>
        {open && anchor && (
          <FloatMenu anchor={anchor} onClose={() => setOpen(false)} width={220}>
            <button className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover" onClick={() => { onChange(null); setOpen(false); }}>
              未設定
            </button>
            {members.map((m) => (
              <button key={m.userId} className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover" onClick={() => { onChange(m.userId); setOpen(false); }}>
                <Avatar name={m.name} seed={m.userId} size={18} />
                {m.name}
              </button>
            ))}
          </FloatMenu>
        )}
      </>
    );
  }

  if (property.type === "relation") {
    const ids = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
    const linked = pages.filter((p) => ids.includes(p.id));
    const pool = property.databaseId ? pages.filter((p) => p.parentId === property.databaseId) : pages;
    return (
      <>
        <button
          type="button"
          disabled={!editable}
          className={`${hit}flex h-7 w-full items-center gap-1 overflow-hidden rounded-[4px] px-0.5 text-left hover:bg-hover`}
          onClick={(e) => {
            e.stopPropagation();
            openMenu(e.currentTarget);
          }}
        >
          {linked.length ? linked.map((p) => (
            <span key={p.id} className="truncate rounded-[4px] bg-canvas px-1.5 py-0.5 text-[12px]">{p.title || "無題"}</span>
          )) : <span className="text-muted">未設定</span>}
        </button>
        {open && anchor && (
          <FloatMenu anchor={anchor} onClose={() => setOpen(false)} width={240}>
            {pool.slice(0, 30).map((p) => {
              const on = ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  className="flex w-full rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                  onClick={() => {
                    const next = on ? ids.filter((x) => x !== p.id) : [...ids, p.id];
                    onChange(next);
                  }}
                >
                  {on ? "✓ " : ""}<PageIcon icon={p.icon} size={14} className="mr-1 align-middle" /> {p.title || "無題"}
                </button>
              );
            })}
          </FloatMenu>
        )}
      </>
    );
  }

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        disabled={!editable}
        checked={Boolean(value)}
        className="arcana-prop-check accent-[#37352f]"
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (property.type === "multi_select") {
    const ids = Array.isArray(value) ? value.map(String) : [];
    const selected = (property.options ?? []).filter((o) => ids.includes(o.id));
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          disabled={!editable}
          className={`${hit}flex h-7 w-full items-center gap-1 overflow-hidden rounded-[4px] px-0.5 text-left hover:bg-hover disabled:hover:bg-transparent`}
          onClick={(e) => {
            e.stopPropagation();
            openMenu(e.currentTarget);
          }}
        >
          {selected.length ? selected.map((o) => (
            <span key={o.id} className={`truncate rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(o.color)}`}>{o.name}</span>
          )) : <span className="text-[13px] text-muted">未設定</span>}
        </button>
        {open && anchor && (
          <FloatMenu anchor={anchor} onClose={() => setOpen(false)} width={220}>
            {(property.options ?? []).map((o) => {
              const on = ids.includes(o.id);
              return (
                <button
                  key={o.id}
                  className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left hover:bg-hover"
                  onClick={() => onChange(on ? ids.filter((x) => x !== o.id) : [...ids, o.id])}
                >
                  <span className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(o.color)}`}>{on ? "✓ " : ""}{o.name}</span>
                </button>
              );
            })}
            {onUpdateOptions && (
              <form
                className="mt-1 border-t border-line px-1 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newOpt.trim();
                  if (!name) return;
                  const opt = newSelectOption(name, property.options?.length ?? 0);
                  onUpdateOptions([...(property.options ?? []), opt]);
                  onChange([...ids, opt.id]);
                  setNewOpt("");
                }}
              >
                <input
                  className="h-8 w-full rounded-[6px] border-none bg-transparent px-2 text-[13px] outline-none placeholder:text-muted"
                  placeholder="オプションを追加"
                  value={newOpt}
                  onChange={(e) => setNewOpt(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </form>
            )}
          </FloatMenu>
        )}
      </>
    );
  }

  if (property.type === "select" || property.type === "status") {
    const current = property.options?.find((o) => o.id === String(value ?? ""));
    return (
      <>
        <button
          ref={btnRef}
          type="button"
          disabled={!editable}
          className={`${hit}flex h-7 w-full items-center rounded-[4px] px-0.5 text-left hover:bg-hover disabled:hover:bg-transparent`}
          onClick={(e) => {
            e.stopPropagation();
            openMenu(e.currentTarget);
          }}
        >
          {current ? (
            <span className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(current.color)}`}>
              {current.name}
            </span>
          ) : (
            <span className="text-[13px] text-muted">未設定</span>
          )}
        </button>
        {open && anchor && (
          <FloatMenu anchor={anchor} onClose={() => setOpen(false)} width={220}>
            <button
              className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[13px] text-muted hover:bg-hover"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              未設定
            </button>
            {(property.options ?? []).map((o) => (
              <button
                key={o.id}
                className="flex w-full items-center rounded-[6px] px-2 py-1.5 text-left hover:bg-hover"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                <span className={`rounded-[4px] px-1.5 py-0.5 text-[12px] ${optionClass(o.color)}`}>{o.name}</span>
              </button>
            ))}
            {onUpdateOptions && (
              <form
                className="mt-1 border-t border-line px-1 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newOpt.trim();
                  if (!name) return;
                  const opt = newSelectOption(name, property.options?.length ?? 0);
                  onUpdateOptions([...(property.options ?? []), opt]);
                  onChange(opt.id);
                  setNewOpt("");
                  setOpen(false);
                }}
              >
                <input
                  className="h-8 w-full rounded-[6px] border-none bg-transparent px-2 text-[13px] outline-none placeholder:text-muted"
                  placeholder="オプションを追加"
                  value={newOpt}
                  onChange={(e) => setNewOpt(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </form>
            )}
          </FloatMenu>
        )}
      </>
    );
  }

  if (open && (property.type === "number" || property.type === "date" || property.type === "text")) {
    return (
      <input
        autoFocus
        type={property.type === "number" ? "number" : property.type === "date" ? "date" : "text"}
        className={`${hit}h-7 w-full border-none bg-transparent text-[16px] outline-none`}
        value={draft}
        placeholder="未設定"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setOpen(false);
          if (property.type === "number") onChange(draft === "" ? null : Number(draft));
          else onChange(draft || null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setOpen(false);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const label =
    value == null || value === ""
      ? ""
      : property.type === "date"
        ? String(value)
        : String(value);

  return (
    <button
      type="button"
      disabled={!editable}
      className={`${hit}flex h-7 w-full items-center rounded-[4px] px-0.5 text-left text-[13px] hover:bg-hover disabled:hover:bg-transparent`}
      onClick={(e) => {
        e.stopPropagation();
        openMenu(e.currentTarget);
      }}
    >
      {label ? <span className="truncate">{label}</span> : <span className="text-muted">未設定</span>}
    </button>
  );
}
