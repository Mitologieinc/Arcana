import type { DbProperty } from "../lib/types";

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

export function PropertyValue({
  property,
  value,
  editable,
  onChange,
}: {
  property: DbProperty;
  value: unknown;
  editable: boolean;
  onChange: (next: unknown) => void;
}) {
  if (property.type === "select" || property.type === "status") {
    const current = property.options?.find((o) => o.id === String(value ?? ""));
    return (
      <select
        disabled={!editable}
        className={`max-w-full rounded-[4px] border-none px-1.5 py-0.5 text-[12px] outline-none ${
          current ? optionClass(current.color) : "bg-transparent text-muted"
        }`}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">空</option>
        {(property.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    );
  }

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        disabled={!editable}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (property.type === "number") {
    return (
      <input
        type="number"
        disabled={!editable}
        className="w-24 border-none bg-transparent text-[13px] outline-none"
        defaultValue={value == null || value === "" ? "" : String(value)}
        onBlur={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (property.type === "date") {
    return (
      <input
        type="date"
        disabled={!editable}
        className="border-none bg-transparent text-[13px] text-ink outline-none"
        defaultValue={String(value ?? "")}
        onBlur={(e) => onChange(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      disabled={!editable}
      className="w-full min-w-[6rem] border-none bg-transparent text-[13px] outline-none placeholder:text-muted"
      placeholder="空"
      defaultValue={String(value ?? "")}
      onBlur={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
