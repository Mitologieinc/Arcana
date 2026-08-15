import { eq } from "drizzle-orm";
import type { createDb } from "../db/client";
import * as schema from "../db/schema";

type Db = ReturnType<typeof createDb>;
type Prop = { id: string; name: string; type: string; expression?: string; [k: string]: unknown };

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteFormulaRefs(expression: string, props: { id: string; name: string }[]) {
  let out = expression;
  const ordered = [...props].sort((a, b) => b.name.length - a.name.length);
  for (const p of ordered) {
    if (!p.name) continue;
    const name = escapeReg(p.name);
    out = out.replace(new RegExp(`\\{${name}\\}`, "g"), `{${p.id}}`);
    out = out.replace(new RegExp(`prop\\("${name}"\\)`, "g"), `prop("${p.id}")`);
    out = out.replace(new RegExp(`prop\\('${name}'\\)`, "g"), `prop('${p.id}')`);
  }
  return out;
}

export function parseProps(raw: string | null) {
  if (!raw) return {} as Record<string, unknown>;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseConfig(raw: string) {
  try {
    return JSON.parse(raw) as {
      groupBy?: string;
      filters?: { propertyId: string }[];
      sorts?: { propertyId: string }[];
    };
  } catch {
    return {};
  }
}

export async function applySchemaChange(db: Db, pageId: string, nextRaw: unknown) {
  if (!Array.isArray(nextRaw)) return { properties: [] as Prop[] };
  const next = nextRaw as Prop[];
  const prevRows = await db
    .select()
    .from(schema.databaseSchemas)
    .where(eq(schema.databaseSchemas.pageId, pageId))
    .limit(1);
  let prev: Prop[] = [];
  try {
    prev = prevRows[0] ? (JSON.parse(prevRows[0].properties) as Prop[]) : [];
  } catch {
    prev = [];
  }
  const nextIds = new Set(next.map((p) => p.id));
  const rewritten = next.map((p) => {
    if (p.type !== "formula" || !p.expression) return p;
    return { ...p, expression: rewriteFormulaRefs(p.expression, next) };
  });

  if (prevRows[0]) {
    await db
      .update(schema.databaseSchemas)
      .set({ properties: JSON.stringify(rewritten) })
      .where(eq(schema.databaseSchemas.pageId, pageId));
  } else {
    await db.insert(schema.databaseSchemas).values({ pageId, properties: JSON.stringify(rewritten) });
  }

  const rows = await db.select().from(schema.pages).where(eq(schema.pages.parentId, pageId));
  for (const row of rows) {
    const props = parseProps(row.properties);
    let changed = false;
    for (const key of Object.keys(props)) {
      if (!nextIds.has(key)) {
        delete props[key];
        changed = true;
      }
    }
    if (changed) {
      await db
        .update(schema.pages)
        .set({ properties: JSON.stringify(props), updatedAt: new Date() })
        .where(eq(schema.pages.id, row.id));
    }
  }

  const views = await db.select().from(schema.databaseViews).where(eq(schema.databaseViews.pageId, pageId));
  for (const view of views) {
    const config = parseConfig(view.config);
    let changed = false;
    if (config.groupBy && !nextIds.has(config.groupBy)) {
      if (view.type === "board") {
        config.groupBy = rewritten.find((p) => p.type === "status" || p.type === "select")?.id;
      } else if (view.type === "calendar") {
        config.groupBy = rewritten.find((p) => p.type === "date")?.id;
      } else {
        config.groupBy = undefined;
      }
      changed = true;
    }
    if (config.filters) {
      const filters = config.filters.filter((f) => nextIds.has(f.propertyId));
      if (filters.length !== config.filters.length) {
        config.filters = filters;
        changed = true;
      }
    }
    if (config.sorts) {
      const sorts = config.sorts.filter((s) => nextIds.has(s.propertyId));
      if (sorts.length !== config.sorts.length) {
        config.sorts = sorts;
        changed = true;
      }
    }
    if (changed) {
      await db.update(schema.databaseViews).set({ config: JSON.stringify(config) }).where(eq(schema.databaseViews.id, view.id));
    }
  }

  return { properties: rewritten };
}

export function mergePageProperties(current: string | null, incoming: Record<string, unknown> | null) {
  if (incoming === null) return null;
  return JSON.stringify({ ...parseProps(current), ...incoming });
}
