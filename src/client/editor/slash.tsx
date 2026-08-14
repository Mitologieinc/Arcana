import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  CheckSquare,
  ChevronRight,
  Code,
  Columns3,
  Database,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Lightbulb,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table2,
  Text,
} from "lucide-react";
import { api } from "../lib/api";
import type { Page } from "../lib/types";
import { insertNamedTable } from "./simpleTable";

export type SlashOptions = {
  pageId: string;
  onOpenPage?: (id: string) => void;
  onPagesChanged?: () => Promise<unknown>;
};

export type SlashItem = {
  title: string;
  subtitle: string;
  aliases: string[];
  group: "basic" | "database";
  icon: typeof Text;
  command: (ctx: { editor: Editor; range: Range }) => void;
};

export async function uploadImage(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/files", { method: "POST", body: fd });
  const data = (await res.json()) as { url?: string };
  if (!res.ok || !data.url) throw new Error("画像のアップロードに失敗しました");
  return data.url;
}

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

async function createChildPage(parentId: string, type: "page" | "database" = "page") {
  return api<{ page: Page }>("/api/pages", {
    method: "POST",
    body: JSON.stringify({ parentId, type }),
  });
}

const GROUP_LABEL: Record<SlashItem["group"], string> = {
  basic: "基本ブロック",
  database: "データベース",
};

export function slashItems(opts: SlashOptions): SlashItem[] {
  return [
    {
      title: "テキスト",
      subtitle: "普通の段落",
      aliases: ["text", "p", "テキスト"],
      group: "basic",
      icon: Text,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      title: "見出し 1",
      subtitle: "大きな見出し",
      aliases: ["h1", "heading", "見出し"],
      group: "basic",
      icon: Heading1,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
    },
    {
      title: "見出し 2",
      subtitle: "中見出し",
      aliases: ["h2", "見出し"],
      group: "basic",
      icon: Heading2,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    },
    {
      title: "見出し 3",
      subtitle: "小見出し",
      aliases: ["h3", "見出し"],
      group: "basic",
      icon: Heading3,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    },
    {
      title: "箇条書き",
      subtitle: "・ 項目を並べる",
      aliases: ["ul", "list", "リスト", "箇条"],
      group: "basic",
      icon: List,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: "番号付きリスト",
      subtitle: "1, 2, 3 の順番",
      aliases: ["ol", "numbered", "番号"],
      group: "basic",
      icon: ListOrdered,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: "ToDo",
      subtitle: "チェックできる項目",
      aliases: ["todo", "task", "チェック"],
      group: "basic",
      icon: CheckSquare,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: "引用",
      subtitle: "引用ブロック",
      aliases: ["quote", "引用"],
      group: "basic",
      icon: Quote,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: "コード",
      subtitle: "コードブロック",
      aliases: ["code", "コード"],
      group: "basic",
      icon: Code,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: "区切り線",
      subtitle: "水平線",
      aliases: ["hr", "divider", "区切り"],
      group: "basic",
      icon: Minus,
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      title: "画像",
      subtitle: "ファイルをアップロード",
      aliases: ["image", "img", "画像", "写真"],
      group: "basic",
      icon: ImageIcon,
      command: ({ editor, range }) => {
        void pickImage().then(async (file) => {
          if (!file) return;
          const src = await uploadImage(file);
          editor.chain().focus().deleteRange(range).setImage({ src }).run();
        });
      },
    },
    {
      title: "表",
      subtitle: "列名つきの表",
      aliases: ["table", "表", "テーブル", "簡易"],
      group: "basic",
      icon: Table2,
      command: ({ editor, range }) => insertNamedTable(editor, range),
    },
    {
      title: "ページ",
      subtitle: "このページの中にサブページ",
      aliases: ["page", "ページ", "サブページ", "子"],
      group: "basic",
      icon: FileText,
      command: ({ editor, range }) => {
        if (!opts.pageId) return;
        void (async () => {
          const d = await createChildPage(opts.pageId, "page");
          await opts.onPagesChanged?.();
          if (editor.isDestroyed) return;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "pageBlock",
              attrs: {
                id: d.page.id,
                title: d.page.title || "無題",
                icon: d.page.icon || "📄",
              },
            })
            .run();
        })();
      },
    },
    {
      title: "コールアウト",
      subtitle: "強調したヒント",
      aliases: ["callout", "コールアウト", "hint", "ヒント", "注意"],
      group: "basic",
      icon: Lightbulb,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "callout",
            attrs: { emoji: "💡" },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      title: "トグル",
      subtitle: "クリックで開閉する見出し",
      aliases: ["toggle", "トグル", "details", "折りたたみ", "プルダウン", "dropdown"],
      group: "basic",
      icon: ChevronRight,
      command: ({ editor, range }) => {
        const insertAt = range.from;
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "details",
            attrs: { open: true },
            content: [
              { type: "detailsSummary" },
              { type: "detailsContent", content: [{ type: "paragraph" }] },
            ],
          })
          .setTextSelection(insertAt + 2)
          .run();
      },
    },
    {
      title: "データベース – インライン",
      subtitle: "このページに埋め込む",
      aliases: ["database", "db", "データベース", "インライン", "inline", "埋め込み"],
      group: "database",
      icon: Columns3,
      command: ({ editor, range }) => {
        if (!opts.pageId) return;
        void (async () => {
          const d = await createChildPage(opts.pageId, "database");
          await opts.onPagesChanged?.();
          if (editor.isDestroyed) return;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: "databaseEmbed",
                attrs: { pageId: d.page.id, title: d.page.title || "無題のデータベース" },
              },
              { type: "paragraph" },
            ])
            .run();
        })();
      },
    },
    {
      title: "データベース – フルページ",
      subtitle: "新しいページとして開く",
      aliases: ["database", "db", "データベース", "フル", "full", "ページ"],
      group: "database",
      icon: Database,
      command: ({ editor, range }) => {
        if (!opts.pageId) return;
        void (async () => {
          const d = await createChildPage(opts.pageId, "database");
          await opts.onPagesChanged?.();
          if (editor.isDestroyed) return;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "pageLink",
              attrs: { id: d.page.id, title: d.page.title || "無題のデータベース" },
            })
            .insertContent(" ")
            .run();
          opts.onOpenPage?.(d.page.id);
        })();
      },
    },
  ];
}

type MenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const SlashMenu = forwardRef<MenuHandle, SuggestionProps<SlashItem, SlashItem>>(function SlashMenu(props, ref) {
  const [index, setIndex] = useState(0);
  const items = props.items;

  useEffect(() => setIndex(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        const item = items[index];
        if (item) props.command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="slash-menu menu-panel">
        <p className="slash-kicker">一致なし</p>
        <p className="px-2.5 pb-3 text-[13px] text-muted">一致するコマンドはありません</p>
      </div>
    );
  }

  return (
    <div className="slash-menu menu-panel">
      {items.map((item, i) => {
        const Icon = item.icon;
        const showKicker = item.group !== items[i - 1]?.group;
        return (
          <div key={item.title}>
            {showKicker && <p className="slash-kicker">{GROUP_LABEL[item.group]}</p>}
            <button
              type="button"
              className={`slash-item ${i === index ? "is-active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => props.command(item)}
            >
              <span className="slash-icon">
                <Icon size={18} />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-[14px] font-medium">{item.title}</span>
                <span className="block truncate text-[12px] text-muted">{item.subtitle}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
});

const slashPluginKey = new PluginKey("slashCommand");

export const SlashCommand = Extension.create<SlashOptions>({
  name: "slashCommand",
  addOptions() {
    return {
      pageId: "",
    };
  },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashPluginKey,
        char: "/",
        allowedPrefixes: [" ", "\n"],
        startOfLine: false,
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          return slashItems(opts).filter(
            (item) =>
              !q ||
              item.title.toLowerCase().includes(q) ||
              item.aliases.some((a) => a.toLowerCase().includes(q)),
          );
        },
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: () => {
          let component: ReactRenderer<MenuHandle, SuggestionProps<SlashItem, SlashItem>> | null = null;
          let unmount: (() => void) | undefined;
          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, { editor: props.editor, props });
              unmount = props.mount(component.element);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                unmount?.();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              unmount?.();
              component?.destroy();
              component = null;
            },
          };
        },
      }),
    ];
  },
});
