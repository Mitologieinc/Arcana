import { Node, mergeAttributes, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import { encodeStateAsUpdate } from "yjs";

const ImportCallout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return { emoji: { default: "💡" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0];
  },
});

const ImportPageBlock = Node.create({
  name: "pageBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: "" }, title: { default: "無題" }, icon: { default: "📄" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="page-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "page-block" })];
  },
});

const ImportPageLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { id: { default: "" }, title: { default: "無題" } };
  },
  parseHTML() {
    return [{ tag: "a[data-page-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, { "data-page-id": HTMLAttributes.id })];
  },
});

const ImportUserMention = Node.create({
  name: "userMention",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { userId: { default: "" }, name: { default: "不明" } };
  },
  parseHTML() {
    return [{ tag: "span[data-user-id].user-mention" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-user-id": HTMLAttributes.userId, class: "user-mention" })];
  },
});

const ImportDatabaseEmbed = Node.create({
  name: "databaseEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return { pageId: { default: "" }, title: { default: "無題のデータベース" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="database-embed"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "database-embed" })];
  },
});

const ImportFileBlock = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" }, name: { default: "ファイル" }, mime: { default: "" } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "file-block" })];
  },
});

const ImportColumn = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column" }), 0];
  },
});

const ImportColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column{2,}",
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column-list" }), 0];
  },
});

const schema = getSchema([
  StarterKit.configure({ undoRedo: false }),
  Underline,
  Highlight.configure({ multicolor: true }),
  TextStyleKit.configure({ fontFamily: false, fontSize: false, lineHeight: false }),
  Image,
  TaskList,
  TaskItem,
  TableKit,
  Details,
  DetailsSummary,
  DetailsContent,
  ImportCallout,
  ImportPageBlock,
  ImportPageLink,
  ImportUserMention,
  ImportDatabaseEmbed,
  ImportFileBlock,
  ImportColumn,
  ImportColumnList,
]);

export function tiptapJsonToUpdate(doc: unknown): Uint8Array {
  const ydoc = prosemirrorJSONToYDoc(schema, doc, "prosemirror");
  return encodeStateAsUpdate(ydoc);
}

export function plainTextToDoc(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const content = (lines.length ? lines : [""]).map((line) => ({
    type: "paragraph" as const,
    content: line ? [{ type: "text" as const, text: line }] : [],
  }));
  return { type: "doc" as const, content };
}

export function plainTextFromDoc(node: unknown): string {
  const parts: string[] = [];
  walk(node, parts);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export type TipTapDoc = { type: "doc"; content: unknown[] };

export function normalizeTipTapDoc(raw: unknown): TipTapDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as { type?: unknown; content?: unknown };
  if (n.type !== "doc") return null;
  return { type: "doc", content: Array.isArray(n.content) ? n.content : [] };
}

function walk(node: unknown, parts: string[]) {
  if (!node || typeof node !== "object") return;
  const n = node as { text?: string; content?: unknown[]; type?: string; attrs?: { name?: string; title?: string } };
  if (typeof n.text === "string") parts.push(n.text);
  if (n.type === "userMention" && n.attrs?.name) parts.push(`@${n.attrs.name}`);
  if (n.type === "pageLink" && n.attrs?.title) parts.push(n.attrs.title);
  if (Array.isArray(n.content)) {
    for (const child of n.content) walk(child, parts);
  }
}
