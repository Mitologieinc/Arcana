import { richPlain } from "./notion";

type DbProperty = {
  id: string;
  type: "title" | "select" | "status" | "date" | "person" | "number" | "checkbox" | "text" | "relation" | "formula";
  name: string;
  options?: { id: string; name: string; color: string }[];
  databaseId?: string;
};

type JSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

const SELECT_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"];

const NOTION_COLOR: Record<string, string> = {
  gray: "gray",
  brown: "orange",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  purple: "purple",
  pink: "pink",
  red: "red",
  default: "gray",
};

const TEXT_HEX: Record<string, string> = {
  gray: "#787774",
  brown: "#9f6b53",
  orange: "#d9730d",
  yellow: "#cb912f",
  green: "#448361",
  blue: "#337ea9",
  purple: "#9065b0",
  pink: "#c14c8a",
  red: "#d44c47",
};

const BG_HEX: Record<string, string> = {
  gray: "#ebeced",
  brown: "#e9e5e3",
  orange: "#fadec9",
  yellow: "#fdecc8",
  green: "#dbeddb",
  blue: "#d3e5ef",
  purple: "#e8deee",
  pink: "#f5e0e9",
  red: "#ffe2dd",
};

export type ImageUploader = (url: string) => Promise<string | null>;

function mappedId(idMap: Record<string, string>, notionId?: string | null) {
  if (!notionId) return undefined;
  return idMap[notionId] || idMap[notionId.replaceAll("-", "")];
}

function inlines(rich: unknown, idMap: Record<string, string>): JSONNode[] {
  if (!Array.isArray(rich)) return [];
  const out: JSONNode[] = [];
  for (const raw of rich) {
    const t = raw as {
      type?: string;
      plain_text?: string;
      href?: string | null;
      annotations?: {
        bold?: boolean;
        italic?: boolean;
        strikethrough?: boolean;
        underline?: boolean;
        code?: boolean;
        color?: string;
      };
      mention?: { type?: string; page?: { id?: string }; database?: { id?: string } };
      equation?: { expression?: string };
      text?: { link?: { url?: string } };
    };
    if (t.type === "mention" && t.mention?.type === "page" && t.mention.page?.id) {
      const id = mappedId(idMap, t.mention.page.id);
      if (id) {
        out.push({ type: "pageLink", attrs: { id, title: t.plain_text || "無題" } });
        continue;
      }
    }
    if (t.type === "mention" && t.mention?.type === "database" && t.mention.database?.id) {
      const id = mappedId(idMap, t.mention.database.id);
      if (id) {
        out.push({ type: "pageLink", attrs: { id, title: t.plain_text || "データベース" } });
        continue;
      }
    }
    const text = t.type === "equation" ? t.equation?.expression || t.plain_text || "" : t.plain_text ?? "";
    if (!text) continue;
    const marks: JSONNode["marks"] = [];
    if (t.annotations?.bold) marks.push({ type: "bold" });
    if (t.annotations?.italic) marks.push({ type: "italic" });
    if (t.annotations?.strikethrough) marks.push({ type: "strike" });
    if (t.annotations?.underline) marks.push({ type: "underline" });
    if (t.annotations?.code || t.type === "equation") marks.push({ type: "code" });
    const href = t.href || t.text?.link?.url;
    if (href && /^(https?:\/\/|mailto:)/i.test(href)) marks.push({ type: "link", attrs: { href } });
    const color = t.annotations?.color ?? "default";
    if (color.endsWith("_background")) {
      const key = color.replace(/_background$/, "");
      marks.push({ type: "highlight", attrs: { color: BG_HEX[key] ?? BG_HEX.yellow } });
    } else if (color !== "default" && TEXT_HEX[color]) {
      marks.push({ type: "textStyle", attrs: { color: TEXT_HEX[color] } });
    }
    out.push({ type: "text", text, marks: marks.length ? marks : undefined });
  }
  return out;
}

function paragraph(rich: unknown, idMap: Record<string, string>): JSONNode {
  const content = inlines(rich, idMap);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function listItem(type: "listItem" | "taskItem", rich: unknown, idMap: Record<string, string>, attrs?: Record<string, unknown>, extra?: JSONNode[]): JSONNode {
  const content = [paragraph(rich, idMap), ...(extra ?? [])];
  return attrs ? { type, attrs, content } : { type, content };
}

export function notionFileUrl(file: unknown): string | null {
  if (!file || typeof file !== "object") return null;
  const f = file as { type?: string; file?: { url?: string }; external?: { url?: string } };
  return f.file?.url || f.external?.url || null;
}

function linkParagraph(url: string, label?: string): JSONNode {
  const text = label || url;
  return { type: "paragraph", content: [{ type: "text", text, marks: [{ type: "link", attrs: { href: url } }] }] };
}

function detailsBlock(summary: JSONNode[], kids: JSONNode[]): JSONNode {
  return {
    type: "details",
    content: [
      { type: "detailsSummary", content: summary.length ? summary : [{ type: "text", text: "トグル" }] },
      { type: "detailsContent", content: kids.length ? kids : [{ type: "paragraph" }] },
    ],
  };
}

export async function blocksToDoc(
  blocks: Record<string, unknown>[],
  idMap: Record<string, string>,
  upload: ImageUploader,
): Promise<{ type: "doc"; content: JSONNode[] }> {
  const content: JSONNode[] = [];
  let list: { kind: "bullet" | "ordered" | "task"; items: JSONNode[] } | null = null;

  const flush = () => {
    if (!list) return;
    const type = list.kind === "bullet" ? "bulletList" : list.kind === "ordered" ? "orderedList" : "taskList";
    content.push({ type, content: list.items });
    list = null;
  };

  const childDoc = async (block: Record<string, unknown>) => {
    const children = (block.children as Record<string, unknown>[] | undefined) ?? [];
    if (!children.length) return [] as JSONNode[];
    const nested = await blocksToDoc(children, idMap, upload);
    return nested.content;
  };

  for (const block of blocks) {
    const type = String(block.type ?? "");
    const data = (block[type] as Record<string, unknown> | undefined) ?? {};
    const rich = data.rich_text;

    if (type !== "bulleted_list_item" && type !== "numbered_list_item" && type !== "to_do") flush();

    if (type === "paragraph") {
      content.push(paragraph(rich, idMap));
      const extra = await childDoc(block);
      content.push(...extra);
    } else if (type === "heading_1" || type === "heading_2" || type === "heading_3") {
      const level = type === "heading_1" ? 1 : type === "heading_2" ? 2 : 3;
      const inner = inlines(rich, idMap);
      if (data.is_toggleable) {
        content.push(detailsBlock(inner.length ? inner : [{ type: "text", text: `見出し ${level}` }], await childDoc(block)));
      } else {
        content.push({ type: "heading", attrs: { level }, content: inner.length ? inner : [{ type: "text", text: " " }] });
      }
    } else if (type === "bulleted_list_item") {
      if (list?.kind !== "bullet") {
        flush();
        list = { kind: "bullet", items: [] };
      }
      list.items.push(listItem("listItem", rich, idMap, undefined, await childDoc(block)));
    } else if (type === "numbered_list_item") {
      if (list?.kind !== "ordered") {
        flush();
        list = { kind: "ordered", items: [] };
      }
      list.items.push(listItem("listItem", rich, idMap, undefined, await childDoc(block)));
    } else if (type === "to_do") {
      if (list?.kind !== "task") {
        flush();
        list = { kind: "task", items: [] };
      }
      list.items.push(listItem("taskItem", rich, idMap, { checked: Boolean(data.checked) }, await childDoc(block)));
    } else if (type === "quote") {
      content.push({ type: "blockquote", content: [paragraph(rich, idMap), ...(await childDoc(block))] });
    } else if (type === "callout") {
      const emoji =
        data.icon && typeof data.icon === "object" && (data.icon as { emoji?: string }).emoji
          ? (data.icon as { emoji: string }).emoji
          : "💡";
      const kids = await childDoc(block);
      const paras = [paragraph(rich, idMap), ...kids.filter((n) => n.type === "paragraph")];
      const rest = kids.filter((n) => n.type !== "paragraph");
      content.push({
        type: "callout",
        attrs: { emoji },
        content: paras.length ? paras : [paragraph(rich, idMap)],
      });
      content.push(...rest);
    } else if (type === "toggle") {
      const summary = inlines(rich, idMap);
      const kids = await childDoc(block);
      content.push({
        type: "details",
        content: [
          { type: "detailsSummary", content: summary.length ? summary : [{ type: "text", text: "トグル" }] },
          { type: "detailsContent", content: kids.length ? kids : [{ type: "paragraph" }] },
        ],
      });
    } else if (type === "code") {
      const text = richPlain(rich) || " ";
      content.push({
        type: "codeBlock",
        attrs: { language: String(data.language || "") },
        content: [{ type: "text", text }],
      });
    } else if (type === "divider") {
      content.push({ type: "horizontalRule" });
    } else if (type === "image") {
      const url = notionFileUrl(data);
      const src = url ? await upload(url) : null;
      if (src) content.push({ type: "image", attrs: { src, alt: richPlain(data.caption) } });
      else if (url) content.push(linkParagraph(url, richPlain(data.caption) || url));
    } else if (type === "video" || type === "file" || type === "pdf" || type === "audio") {
      const url = notionFileUrl(data);
      if (url) content.push(linkParagraph(url, richPlain(data.caption) || url));
    } else if (type === "equation") {
      const expr = String(data.expression || "");
      if (expr) content.push({ type: "codeBlock", attrs: { language: "" }, content: [{ type: "text", text: expr }] });
    } else if (type === "table") {
      const rows = ((block.children as Record<string, unknown>[]) ?? []).filter((r) => r.type === "table_row");
      const header = Boolean(data.has_column_header);
      const rowHeader = Boolean(data.has_row_header);
      const tableRows: JSONNode[] = [];
      rows.forEach((row, i) => {
        const cells = ((row.table_row as { cells?: unknown[] })?.cells ?? []) as unknown[][];
        tableRows.push({
          type: "tableRow",
          content: cells.map((cell, j) => ({
            type: (header && i === 0) || (rowHeader && j === 0) ? "tableHeader" : "tableCell",
            content: [paragraph(cell, idMap)],
          })),
        });
      });
      if (tableRows.length) content.push({ type: "table", content: tableRows });
    } else if (type === "child_page") {
      const notionId = String(block.id);
      const id = mappedId(idMap, notionId);
      const title = String((data as { title?: string }).title || "無題");
      if (id) content.push({ type: "pageBlock", attrs: { id, title, icon: "📄" } });
      else content.push({ type: "paragraph", content: [{ type: "text", text: title, marks: [{ type: "bold" }] }] });
    } else if (type === "child_database") {
      const notionId = String(block.id);
      const id = mappedId(idMap, notionId);
      const title = String((data as { title?: string }).title || "データベース");
      if (id) content.push({ type: "databaseEmbed", attrs: { pageId: id, title } });
      else content.push({ type: "paragraph", content: [{ type: "text", text: title, marks: [{ type: "bold" }] }] });
    } else if (type === "link_to_page") {
      const target = data as { type?: string; page_id?: string; database_id?: string };
      const notionId = target.page_id || target.database_id;
      const id = mappedId(idMap, notionId);
      if (id && target.database_id) content.push({ type: "databaseEmbed", attrs: { pageId: id, title: "データベース" } });
      else if (id) content.push({ type: "pageBlock", attrs: { id, title: "無題", icon: "📄" } });
    } else if (type === "bookmark" || type === "embed" || type === "link_preview") {
      const url = String(data.url || "");
      if (url) content.push(linkParagraph(url, richPlain(data.caption) || url));
    } else if (type === "column_list" || type === "synced_block" || type === "column") {
      content.push(...(await childDoc(block)));
    } else if (rich) {
      content.push(paragraph(rich, idMap));
    }
  }
  flush();
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

export function mapDatabaseSchema(properties: Record<string, unknown>): {
  properties: DbProperty[];
  keyMap: Record<string, string>;
} {
  const props: DbProperty[] = [];
  const keyMap: Record<string, string> = {};
  for (const [name, raw] of Object.entries(properties)) {
    const p = raw as {
      id?: string;
      type?: string;
      select?: { options?: { id: string; name: string; color?: string }[] };
      status?: { options?: { id: string; name: string; color?: string }[] };
      relation?: { database_id?: string };
    };
    const type = p.type ?? "rich_text";
    if (type === "title") {
      const id = "title";
      keyMap[p.id ?? name] = id;
      keyMap[name] = id;
      props.unshift({ id, type: "title", name: name || "名前" });
      continue;
    }
    const id = crypto.randomUUID();
    keyMap[p.id ?? name] = id;
    keyMap[name] = id;
    if (type === "select") {
      const options = p.select?.options ?? [];
      props.push({
        id,
        type: "select",
        name,
        options: options.map((o, i) => ({
          id: o.id,
          name: o.name,
          color: NOTION_COLOR[o.color ?? ""] ?? SELECT_COLORS[i % SELECT_COLORS.length],
        })),
      });
    } else if (type === "status") {
      const options = p.status?.options ?? [];
      props.push({
        id,
        type: "status",
        name,
        options: options.map((o, i) => ({
          id: o.id,
          name: o.name,
          color: NOTION_COLOR[o.color ?? ""] ?? SELECT_COLORS[i % SELECT_COLORS.length],
        })),
      });
    } else if (type === "number") props.push({ id, type: "number", name });
    else if (type === "checkbox") props.push({ id, type: "checkbox", name });
    else if (type === "date" || type === "created_time" || type === "last_edited_time") props.push({ id, type: "date", name });
    else if (type === "relation") props.push({ id, type: "relation", name, databaseId: p.relation?.database_id });
    else if (type === "button") continue;
    else props.push({ id, type: "text", name });
  }
  if (!props.some((p) => p.type === "title")) props.unshift({ id: "title", type: "title", name: "名前" });
  return { properties: props, keyMap };
}

export function mapRowProperties(
  properties: Record<string, unknown>,
  keyMap: Record<string, string>,
  schema: DbProperty[],
): { title: string; values: Record<string, unknown> } {
  let title = "無題";
  const values: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(properties)) {
    const p = raw as {
      id?: string;
      type?: string;
      title?: unknown;
      rich_text?: unknown;
      select?: { id?: string; name?: string } | null;
      status?: { id?: string; name?: string } | null;
      multi_select?: { name?: string }[];
      number?: number | null;
      checkbox?: boolean;
      date?: { start?: string | null } | null;
      url?: string | null;
      email?: string | null;
      phone_number?: string | null;
      people?: { name?: string }[];
      relation?: { id?: string }[];
      formula?: { type?: string; string?: string | null; number?: number | null; boolean?: boolean | null; date?: { start?: string | null } | null };
      rollup?: { type?: string; number?: number | null; date?: { start?: string | null } | null; array?: { type?: string; title?: unknown; rich_text?: unknown; name?: string }[] };
      files?: { name?: string }[];
      created_time?: string;
      last_edited_time?: string;
      unique_id?: { prefix?: string | null; number?: number | null };
      created_by?: { name?: string };
      last_edited_by?: { name?: string };
    };
    const key = keyMap[p.id ?? ""] || keyMap[name];
    if (!key) continue;
    if (p.type === "title") {
      title = richPlain(p.title) || "無題";
      continue;
    }
    const def = schema.find((s) => s.id === key);
    if (!def) continue;
    if (p.type === "select") values[key] = p.select?.id ?? null;
    else if (p.type === "status") values[key] = p.status?.id ?? null;
    else if (p.type === "multi_select") values[key] = (p.multi_select ?? []).map((o) => o.name).join(", ");
    else if (p.type === "number") values[key] = p.number;
    else if (p.type === "checkbox") values[key] = Boolean(p.checkbox);
    else if (p.type === "date") values[key] = p.date?.start ? String(p.date.start).slice(0, 10) : null;
    else if (p.type === "url") values[key] = p.url ?? "";
    else if (p.type === "email") values[key] = p.email ?? "";
    else if (p.type === "phone_number") values[key] = p.phone_number ?? "";
    else if (p.type === "people") values[key] = (p.people ?? []).map((u) => u.name).filter(Boolean).join(", ");
    else if (p.type === "relation") values[key] = (p.relation ?? []).map((r) => r.id).filter((id): id is string => Boolean(id));
    else if (p.type === "rich_text") values[key] = richPlain(p.rich_text);
    else if (p.type === "formula") values[key] = formulaSnapshot(p.formula);
    else if (p.type === "rollup") values[key] = rollupSnapshot(p.rollup);
    else if (p.type === "files") values[key] = (p.files ?? []).map((f) => f.name).filter(Boolean).join(", ");
    else if (p.type === "created_time") values[key] = p.created_time ? String(p.created_time).slice(0, 10) : null;
    else if (p.type === "last_edited_time") values[key] = p.last_edited_time ? String(p.last_edited_time).slice(0, 10) : null;
    else if (p.type === "unique_id") {
      const prefix = p.unique_id?.prefix;
      const num = p.unique_id?.number;
      values[key] = [prefix, num].filter((x) => x != null && x !== "").join("-");
    } else if (p.type === "created_by") values[key] = p.created_by?.name ?? "";
    else if (p.type === "last_edited_by") values[key] = p.last_edited_by?.name ?? "";
  }
  return { title, values };
}

function formulaSnapshot(f: {
  type?: string;
  string?: string | null;
  number?: number | null;
  boolean?: boolean | null;
  date?: { start?: string | null } | null;
} | undefined) {
  if (!f) return "";
  if (f.type === "number") return f.number == null ? "" : String(f.number);
  if (f.type === "boolean") return f.boolean ? "true" : "false";
  if (f.type === "date") return f.date?.start ? String(f.date.start).slice(0, 10) : "";
  return f.string ?? "";
}

function rollupSnapshot(r: {
  type?: string;
  number?: number | null;
  date?: { start?: string | null } | null;
  array?: { type?: string; title?: unknown; rich_text?: unknown; name?: string }[];
} | undefined) {
  if (!r) return "";
  if (r.type === "number") return r.number == null ? "" : String(r.number);
  if (r.type === "date") return r.date?.start ? String(r.date.start).slice(0, 10) : "";
  if (r.type === "array") {
    return (r.array ?? [])
      .map((item) => {
        if (item.title) return richPlain(item.title);
        if (item.rich_text) return richPlain(item.rich_text);
        return item.name ?? "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

export function remapNotionId(idMap: Record<string, string>, notionId?: string | null) {
  if (!notionId) return undefined;
  return idMap[notionId] || idMap[notionId.replaceAll("-", "")];
}

export function remapRelationSchema(properties: DbProperty[], idMap: Record<string, string>): DbProperty[] {
  return properties.map((p) => {
    if (p.type !== "relation") return p;
    const mapped = remapNotionId(idMap, p.databaseId);
    return { ...p, databaseId: mapped };
  });
}

export function remapRelationValues(
  values: Record<string, unknown>,
  properties: DbProperty[],
  idMap: Record<string, string>,
): Record<string, unknown> {
  const next = { ...values };
  for (const p of properties) {
    if (p.type !== "relation") continue;
    const raw = next[p.id];
    const ids = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
    next[p.id] = ids.map((id) => remapNotionId(idMap, id)).filter((id): id is string => Boolean(id));
  }
  return next;
}

export function emojiIcon(icon: { type?: string; emoji?: string } | null | undefined, fallback: string) {
  if (icon?.type === "emoji" && icon.emoji) return icon.emoji;
  return fallback;
}
