import { findParentNode, type Editor, type Range } from "@tiptap/core";

function cell(type: "tableHeader" | "tableCell", text?: string) {
  return {
    type,
    content: [
      {
        type: "paragraph" as const,
        ...(text ? { content: [{ type: "text" as const, text }] } : {}),
      },
    ],
  };
}

export function namedTableContent(rows = 3, cols = 2) {
  return {
    type: "table" as const,
    content: [
      {
        type: "tableRow" as const,
        content: Array.from({ length: cols }, (_, i) => cell("tableHeader", `列 ${i + 1}`)),
      },
      ...Array.from({ length: Math.max(rows - 1, 1) }, () => ({
        type: "tableRow" as const,
        content: Array.from({ length: cols }, () => cell("tableCell")),
      })),
    ],
  };
}

export function insertNamedTable(editor: Editor, range?: Range) {
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range);
  chain.insertContent(namedTableContent()).run();
}

function currentCellIndex(editor: Editor) {
  const cellNode = findParentNode((n) => n.type.name === "tableHeader" || n.type.name === "tableCell")(
    editor.state.selection,
  );
  const row = findParentNode((n) => n.type.name === "tableRow")(editor.state.selection);
  if (!cellNode || !row) return null;
  let found: number | null = null;
  row.node.forEach((_child, offset, index) => {
    if (row.start + offset === cellNode.pos) found = index;
  });
  return found;
}

function nextColumnLabel(headerRow: { childCount: number; child: (i: number) => { textContent: string } }) {
  const used = new Set<string>();
  for (let i = 0; i < headerRow.childCount; i += 1) {
    const t = headerRow.child(i).textContent.trim();
    if (t) used.add(t);
  }
  let n = 1;
  while (used.has(`列 ${n}`)) n += 1;
  return `列 ${n}`;
}

export function addNamedColumn(editor: Editor, where: "before" | "after") {
  const col = currentCellIndex(editor);
  const added =
    where === "before"
      ? editor.chain().focus().addColumnBefore().run()
      : editor.chain().focus().addColumnAfter().run();
  if (!added) return;

  const table = findParentNode((n) => n.type.name === "table")(editor.state.selection);
  if (!table) return;
  const headerRow = table.node.firstChild;
  if (!headerRow) return;

  const newIndex =
    col === null ? headerRow.childCount - 1 : where === "after" ? col + 1 : col;
  const clamped = Math.min(Math.max(newIndex, 0), headerRow.childCount - 1);

  let targetPos: number | null = null;
  headerRow.forEach((_cell, offset, index) => {
    if (index === clamped) targetPos = table.start + 1 + offset;
  });
  if (targetPos === null) return;

  const cellAt = editor.state.doc.nodeAt(targetPos);
  if (!cellAt || cellAt.textContent.trim()) return;

  editor.chain().insertContentAt(targetPos + 2, nextColumnLabel(headerRow)).run();
}
