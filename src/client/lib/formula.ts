import type { DbProperty } from "./types";

function propValue(name: string, title: string, schema: DbProperty[], values: Record<string, unknown>): string {
  if (name === "名前" || name === "title" || name === "Name") return title;
  const prop = schema.find((s) => s.name === name || s.id === name);
  if (!prop) return "";
  const raw = values[prop.id];
  if (prop.type === "checkbox") return raw ? "true" : "false";
  if (Array.isArray(raw)) {
    if (prop.options?.length) {
      return raw.map((id) => prop.options?.find((o) => o.id === String(id))?.name ?? String(id)).filter(Boolean).join(", ");
    }
    return raw.map(String).join(", ");
  }
  if (prop.options?.length) {
    return prop.options.find((o) => o.id === String(raw ?? ""))?.name ?? (raw == null ? "" : String(raw));
  }
  return raw == null ? "" : String(raw);
}

function truthy(v: string) {
  const s = v.trim().toLowerCase();
  return s !== "" && s !== "0" && s !== "false" && s !== "null";
}

function splitArgs(src: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: string | null = null;
  for (const ch of src) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function evalExpr(src: string, ctx: { title: string; schema: DbProperty[]; values: Record<string, unknown> }): string {
  let s = src.trim();
  if (!s) return "";
  const prop = s.match(/^prop\("([^"]+)"\)$/) || s.match(/^prop\('([^']+)'\)$/) || s.match(/^\{([^}]+)\}$/);
  if (prop) return propValue(prop[1], ctx.title, ctx.schema, ctx.values);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);

  const call = s.match(/^([a-zA-Z_]+)\((.*)\)$/s);
  if (call) {
    const name = call[1].toLowerCase();
    const args = splitArgs(call[2]).map((a) => evalExpr(a, ctx));
    if (name === "if") return truthy(args[0] ?? "") ? (args[1] ?? "") : (args[2] ?? "");
    if (name === "empty") return truthy(args[0] ?? "") ? "false" : "true";
    if (name === "concat" || name === "format") return args.join("");
    if (name === "length") return String((args[0] ?? "").length);
    if (name === "not") return truthy(args[0] ?? "") ? "false" : "true";
  }

  s = s.replace(/prop\("([^"]+)"\)/g, (_, n) => JSON.stringify(propValue(n, ctx.title, ctx.schema, ctx.values)));
  s = s.replace(/prop\('([^']+)'\)/g, (_, n) => JSON.stringify(propValue(n, ctx.title, ctx.schema, ctx.values)));
  s = s.replace(/\{([^}]+)\}/g, (_, n) => JSON.stringify(propValue(n, ctx.title, ctx.schema, ctx.values)));

  if (/^[0-9.\s+\-*/()]+$/.test(s)) {
    try {
      const n = Function(`"use strict"; return (${s})`)();
      return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
    } catch {
      return "";
    }
  }
  return s.replace(/^"|"$/g, "");
}

export function evalFormula(
  expression: string,
  ctx: { title: string; schema: DbProperty[]; values: Record<string, unknown> },
  fallback = "",
): string {
  try {
    const out = evalExpr(expression, ctx);
    return out === "" ? fallback : out;
  } catch {
    return fallback;
  }
}

export function translateNotionFormula(expression: string) {
  return expression.replace(/prop\("([^"]+)"\)/g, "{$1}").replace(/prop\('([^']+)'\)/g, "{$1}");
}
