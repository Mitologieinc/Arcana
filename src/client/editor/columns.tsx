import { Node, mergeAttributes } from "@tiptap/core";

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "arcana-column" }), 0];
  },
});

export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column{2,}",
  isolating: true,
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column-list", class: "arcana-columns" }), 0];
  },
});

export function twoColumns() {
  return {
    type: "columnList" as const,
    content: [
      { type: "column", content: [{ type: "paragraph" }] },
      { type: "column", content: [{ type: "paragraph" }] },
    ],
  };
}
