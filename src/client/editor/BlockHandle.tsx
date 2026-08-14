import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import {
  CheckSquare,
  Code,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Plus,
  Quote,
  Text,
  Trash2,
} from "lucide-react";
import { FloatMenu } from "../components/FloatMenu";

const ATOM_BLOCKS = new Set(["image", "horizontalRule", "pageBlock", "databaseEmbed", "fileBlock"]);

function lockHandle(editor: Editor, locked: boolean) {
  editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked));
}

function nodeAt(editor: Editor, pos: number) {
  if (pos < 0) return null;
  return editor.state.doc.nodeAt(pos);
}

function focusInside(editor: Editor, pos: number) {
  const node = nodeAt(editor, pos);
  if (!node) return false;
  const inside = Math.min(pos + (node.isAtom || node.isLeaf ? 0 : 1), editor.state.doc.content.size);
  editor.chain().focus().setTextSelection(inside).run();
  return true;
}

function prepareTextBlock(editor: Editor, pos: number) {
  const node = nodeAt(editor, pos);
  if (!node) return false;
  if (ATOM_BLOCKS.has(node.type.name) || node.isAtom) {
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, { type: "paragraph" })
      .setTextSelection(pos + 1)
      .run();
    return true;
  }
  return focusInside(editor, pos);
}

const TURN_INTO: {
  title: string;
  icon: typeof Text;
  apply: (editor: Editor) => void;
}[] = [
  {
    title: "テキスト",
    icon: Text,
    apply: (editor) => editor.chain().focus().clearNodes().setParagraph().run(),
  },
  {
    title: "見出し 1",
    icon: Heading1,
    apply: (editor) => editor.chain().focus().clearNodes().setHeading({ level: 1 }).run(),
  },
  {
    title: "見出し 2",
    icon: Heading2,
    apply: (editor) => editor.chain().focus().clearNodes().setHeading({ level: 2 }).run(),
  },
  {
    title: "見出し 3",
    icon: Heading3,
    apply: (editor) => editor.chain().focus().clearNodes().setHeading({ level: 3 }).run(),
  },
  {
    title: "箇条書き",
    icon: List,
    apply: (editor) => editor.chain().focus().clearNodes().toggleBulletList().run(),
  },
  {
    title: "番号付きリスト",
    icon: ListOrdered,
    apply: (editor) => editor.chain().focus().clearNodes().toggleOrderedList().run(),
  },
  {
    title: "ToDo",
    icon: CheckSquare,
    apply: (editor) => editor.chain().focus().clearNodes().toggleTaskList().run(),
  },
  {
    title: "引用",
    icon: Quote,
    apply: (editor) => editor.chain().focus().clearNodes().toggleBlockquote().run(),
  },
  {
    title: "コード",
    icon: Code,
    apply: (editor) => editor.chain().focus().clearNodes().toggleCodeBlock().run(),
  },
];

function insertBelow(editor: Editor, pos: number) {
  const node = nodeAt(editor, pos);
  if (!node) return;
  const insertAt = pos + node.nodeSize;
  editor
    .chain()
    .focus()
    .insertContentAt(insertAt, { type: "paragraph" })
    .setTextSelection(insertAt + 1)
    .insertContent("/")
    .run();
}

function duplicateBlock(editor: Editor, pos: number) {
  const node = nodeAt(editor, pos);
  if (!node) return;
  editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
}

function deleteBlock(editor: Editor, pos: number) {
  const node = nodeAt(editor, pos);
  if (!node) return;
  const from = pos;
  const to = pos + node.nodeSize;
  const isLast = editor.state.doc.childCount === 1 && from <= 1 && to >= editor.state.doc.content.size;
  if (isLast) {
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(0, { type: "paragraph" }).run();
    return;
  }
  editor.chain().focus().deleteRange({ from, to }).run();
}

export function BlockHandle({ editor }: { editor: Editor }) {
  const posRef = useRef(-1);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const [menu, setMenu] = useState<{ pos: number; anchor: DOMRect } | null>(null);

  const onNodeChange = useCallback(({ pos }: { pos: number }) => {
    posRef.current = pos;
  }, []);

  const closeMenu = useCallback(() => {
    setMenu(null);
    if (!editor.isDestroyed) lockHandle(editor, false);
  }, [editor]);

  function openMenu(anchor: DOMRect) {
    const pos = posRef.current;
    if (pos < 0 || !nodeAt(editor, pos)) return;
    lockHandle(editor, true);
    setMenu({ pos, anchor });
  }

  return (
    <>
      <DragHandle
        editor={editor}
        className="arcana-block-handle"
        nested
        onNodeChange={onNodeChange}
        onElementDragStart={() => {
          draggingRef.current = true;
          if (menu) closeMenu();
        }}
        onElementDragEnd={() => {
          draggingRef.current = false;
        }}
      >
        <div
          role="button"
          className="arcana-block-plus"
          title="下にブロックを追加"
          draggable={false}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (menu) closeMenu();
            insertBelow(editor, posRef.current);
          }}
        >
          <Plus size={16} />
        </div>
        <div
          role="button"
          className="arcana-block-grip"
          title="ドラッグして移動。クリックでメニュー"
          onPointerDown={(e) => {
            pointerRef.current = { x: e.clientX, y: e.clientY };
            draggingRef.current = false;
          }}
          onPointerUp={(e) => {
            const start = pointerRef.current;
            pointerRef.current = null;
            if (!start || draggingRef.current) return;
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
            openMenu(e.currentTarget.getBoundingClientRect());
          }}
        >
          <GripVertical size={16} />
        </div>
      </DragHandle>
      {menu && (
        <FloatMenu anchor={menu.anchor} width={220} onClose={closeMenu}>
          <p className="slash-kicker">ブロックタイプ</p>
          {TURN_INTO.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
                onClick={() => {
                  if (prepareTextBlock(editor, menu.pos)) item.apply(editor);
                  closeMenu();
                }}
              >
                <Icon size={14} className="text-muted" />
                {item.title}
              </button>
            );
          })}
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
            onClick={() => {
              duplicateBlock(editor, menu.pos);
              closeMenu();
            }}
          >
            <Copy size={14} className="text-muted" />
            複製
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-hover"
            onClick={() => {
              deleteBlock(editor, menu.pos);
              closeMenu();
            }}
          >
            <Trash2 size={14} />
            削除
          </button>
        </FloatMenu>
      )}
    </>
  );
}
