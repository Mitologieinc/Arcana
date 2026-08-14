import { useEffect, useMemo, useRef } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { NodeRange } from "@tiptap/extension-node-range";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Columns3,
  Rows3,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { User } from "../lib/types";
import { EditorChromeContext } from "./chrome";
import { DatabaseEmbed } from "./databaseEmbed";
import { Callout } from "./callout";
import { BlockHandle } from "./BlockHandle";
import { ColorButton, LinkButton } from "./FormatMenu";
import { SlashCommand, uploadImage } from "./slash";
import { PageBlock, PageLink, PageMention } from "./pageLink";
import { addNamedColumn } from "./simpleTable";

function showTextBubble({ state }: { state: { selection: { empty: boolean } } }) {
  return !state.selection.empty;
}

function showTableBubble({
  editor,
  state,
}: {
  editor: { isActive: (name: string) => boolean };
  state: { selection: { empty: boolean } };
}) {
  return editor.isActive("table") && state.selection.empty;
}

const COLORS = ["#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#196a63"];

function colorFor(id: string) {
  let n = 0;
  for (const ch of id) n += ch.charCodeAt(0);
  return COLORS[n % COLORS.length];
}

export function TiptapEditor({
  pageId,
  user,
  shareToken,
  editable,
  title,
  compact,
  onOpenPage,
  onPagesChanged,
}: {
  pageId: string;
  user: User;
  shareToken?: string;
  editable: boolean;
  title: string;
  compact?: boolean;
  onOpenPage?: (id: string) => void;
  onPagesChanged?: () => Promise<unknown>;
}) {
  const indexTimer = useRef<number | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;

  const collab = useMemo(() => {
    const doc = new Y.Doc();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params: Record<string, string> = {};
    if (shareToken) params.token = shareToken;
    const provider = new WebsocketProvider(`${proto}//${location.host}/api/collab`, pageId, doc, {
      params,
    });
    return { doc, provider };
  }, [pageId, shareToken]);

  useEffect(() => {
    return () => {
      collab.provider.destroy();
      collab.doc.destroy();
    };
  }, [collab]);

  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    editable,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        link: { openOnClick: false, autolink: true },
        dropcursor: { color: "#37352f", width: 2 },
      }),
      Placeholder.configure({
        showOnlyCurrent: true,
        includeChildren: true,
        placeholder: ({ editor, node, pos }) => {
          if (node.type.name === "heading") return `見出し ${node.attrs.level}`;
          if (node.type.name === "detailsSummary") return "クリックで開閉するタイトル";
          const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
          const parent = $pos.parent;
          if (parent.type.name === "tableHeader") return "列名";
          if (parent.type.name === "tableCell") return "";
          if (parent.type.name === "detailsContent") return "折りたたんだ中身を入力";
          for (let d = $pos.depth; d > 0; d--) {
            const name = $pos.node(d).type.name;
            if (name === "taskItem") return "ToDo";
            if (name === "listItem") return "項目";
          }
          return "入力するか、'/' でコマンド";
        },
      }),
      Highlight.configure({ multicolor: true }),
      Underline,
      TextStyleKit.configure({
        fontFamily: false,
        fontSize: false,
        lineHeight: false,
      }),
      Image.configure({ resize: { enabled: true, minWidth: 80, minHeight: 80 } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Details.configure({
        persist: true,
        HTMLAttributes: { class: "arcana-toggle" },
        renderToggleButton: ({ element, isOpen }) => {
          element.title = isOpen ? "中身を隠す" : "中身を表示";
          element.setAttribute("aria-label", isOpen ? "閉じる" : "開く");
        },
      }),
      DetailsSummary,
      DetailsContent,
      Callout,
      TableKit.configure({
        table: { resizable: true },
      }),
      DatabaseEmbed,
      SlashCommand.configure({
        pageId,
        onOpenPage,
        onPagesChanged,
      }),
      PageLink,
      PageBlock,
      PageMention,
      NodeRange.extend({
        addKeyboardShortcuts() {
          return {};
        },
      }),
      Collaboration.configure({
        document: collab.doc,
        field: "prosemirror",
      }),
      CollaborationCaret.configure({
        provider: collab.provider,
        user: { name: user.name || "ゲスト", color: colorFor(user.id) },
      }),
    ],
    editorProps: {
      attributes: {
        class: compact ? "arcana-doc arcana-doc-peek" : "arcana-doc",
        spellcheck: "true",
      },
      handlePaste(view, event) {
        if (!editable) return false;
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        void (async () => {
          for (const file of files) {
            const src = await uploadImage(file);
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(view.state.tr.replaceSelectionWith(node));
          }
        })();
        return true;
      },
      handleDrop(view, event) {
        if (!editable) return false;
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length) return false;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void (async () => {
          for (const file of files) {
            const src = await uploadImage(file);
            const node = view.state.schema.nodes.image.create({ src });
            view.dispatch(view.state.tr.insert(coords?.pos ?? view.state.selection.from, node));
          }
        })();
        return true;
      },
      handleKeyDown(view, event) {
        if (event.key !== "Backspace" && event.key !== "ArrowUp") return false;
        const { selection, doc } = view.state;
        if (!selection.empty) return false;
        if (selection.from > 2) return false;
        const first = doc.firstChild;
        if (!first) return false;
        if (event.key === "ArrowUp" || first.content.size === 0 || selection.from <= 1) {
          event.preventDefault();
          const title = document.querySelector<HTMLInputElement>(".page-title");
          title?.focus();
          if (event.key === "Backspace") {
            const len = title?.value.length ?? 0;
            title?.setSelectionRange(len, len);
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!editable) return;
      if (indexTimer.current) window.clearTimeout(indexTimer.current);
      indexTimer.current = window.setTimeout(() => {
        void api(`/api/pages/${pageId}/index`, {
          method: "POST",
          body: JSON.stringify({ title: titleRef.current, bodyText: ed.getText() }),
        });
      }, 1500);
    },
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <EditorChromeContext.Provider value={{ user, editable, shareToken, onOpenPage, onPagesChanged }}>
    <div
      className={compact ? "arcana-editor" : "arcana-editor min-h-[55vh]"}
      onClick={(e) => {
        if (e.target === e.currentTarget) editor.chain().focus("end").run();
      }}
    >
      {editable && !compact && <BlockHandle editor={editor} />}
      {editable && (
        <BubbleMenu editor={editor} className="bubble-menu menu-panel" shouldShow={showTextBubble}>
          <button
            type="button"
            className={editor.isActive("bold") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="太字"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className={editor.isActive("italic") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="斜体"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            className={editor.isActive("underline") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="下線"
          >
            <UnderlineIcon size={14} />
          </button>
          <button
            type="button"
            className={editor.isActive("strike") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="取り消し線"
          >
            <Strikethrough size={14} />
          </button>
          <button
            type="button"
            className={editor.isActive("code") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="コード"
          >
            <Code size={14} />
          </button>
          <span className="bubble-sep" />
          <LinkButton editor={editor} />
          <ColorButton editor={editor} />
          <span className="bubble-sep" />
          <button
            type="button"
            className={editor.isActive("heading", { level: 1 }) ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="見出し 1"
          >
            <Heading1 size={14} />
          </button>
          <button
            type="button"
            className={editor.isActive("heading", { level: 2 }) ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="見出し 2"
          >
            <Heading2 size={14} />
          </button>
          <button
            type="button"
            className={editor.isActive("heading", { level: 3 }) ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="見出し 3"
          >
            <Heading3 size={14} />
          </button>
        </BubbleMenu>
      )}
      {editable && (
        <BubbleMenu
          editor={editor}
          pluginKey="tableBubble"
          className="bubble-menu menu-panel"
          shouldShow={showTableBubble}
        >
          <button type="button" title="左に列" onClick={() => addNamedColumn(editor, "before")}>
            <BetweenVerticalStart size={14} />
          </button>
          <button type="button" title="右に列" onClick={() => addNamedColumn(editor, "after")}>
            <BetweenVerticalEnd size={14} />
          </button>
          <button type="button" title="列を削除" onClick={() => editor.chain().focus().deleteColumn().run()}>
            <Columns3 size={14} />
          </button>
          <span className="bubble-sep" />
          <button type="button" title="上に行" onClick={() => editor.chain().focus().addRowBefore().run()}>
            <BetweenHorizontalStart size={14} />
          </button>
          <button type="button" title="下に行" onClick={() => editor.chain().focus().addRowAfter().run()}>
            <BetweenHorizontalEnd size={14} />
          </button>
          <button type="button" title="行を削除" onClick={() => editor.chain().focus().deleteRow().run()}>
            <Rows3 size={14} />
          </button>
          <span className="bubble-sep" />
          <button type="button" title="表を削除" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 size={14} />
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
    </EditorChromeContext.Provider>
  );
}
