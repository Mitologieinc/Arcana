import { Node, mergeAttributes, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
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

const schema = getSchema([
  StarterKit.configure({ undoRedo: false }),
  Underline,
  Highlight,
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
]);

export function tiptapJsonToUpdate(doc: unknown): Uint8Array {
  const ydoc = prosemirrorJSONToYDoc(schema, doc, "prosemirror");
  return encodeStateAsUpdate(ydoc);
}

export function plainTextFromDoc(node: unknown): string {
  const parts: string[] = [];
  walk(node, parts);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function walk(node: unknown, parts: string[]) {
  if (!node || typeof node !== "object") return;
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") parts.push(n.text);
  if (Array.isArray(n.content)) {
    for (const child of n.content) walk(child, parts);
  }
}
