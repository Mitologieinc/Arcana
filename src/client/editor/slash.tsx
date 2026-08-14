import { Extension, type Editor, type Range } from "@tiptap/core";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Text,
} from "lucide-react";

export type SlashItem = {
  title: string;
  subtitle: string;
  aliases: string[];
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

export const slashItems: SlashItem[] = [
  {
    title: "テキスト",
    subtitle: "普通の段落",
    aliases: ["text", "p", "テキスト"],
    icon: Text,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "見出し 1",
    subtitle: "大きな見出し",
    aliases: ["h1", "heading", "見出し"],
    icon: Heading1,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: "見出し 2",
    subtitle: "中見出し",
    aliases: ["h2", "見出し"],
    icon: Heading2,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: "見出し 3",
    subtitle: "小見出し",
    aliases: ["h3", "見出し"],
    icon: Heading3,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: "箇条書き",
    subtitle: "箇条書きリスト",
    aliases: ["ul", "list", "リスト", "箇条"],
    icon: List,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "番号付きリスト",
    subtitle: "1, 2, 3…",
    aliases: ["ol", "numbered", "番号"],
    icon: ListOrdered,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "ToDo",
    subtitle: "チェックリスト",
    aliases: ["todo", "task", "チェック"],
    icon: CheckSquare,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "引用",
    subtitle: "引用ブロック",
    aliases: ["quote", "引用"],
    icon: Quote,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "コード",
    subtitle: "コードブロック",
    aliases: ["code", "コード"],
    icon: Code,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "区切り線",
    subtitle: "水平線",
    aliases: ["hr", "divider", "区切り"],
    icon: Minus,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "画像",
    subtitle: "ファイルをアップロード",
    aliases: ["image", "img", "画像", "写真"],
    icon: ImageIcon,
    command: ({ editor, range }) => {
      void pickImage().then(async (file) => {
        if (!file) return;
        const src = await uploadImage(file);
        editor.chain().focus().deleteRange(range).setImage({ src }).run();
      });
    },
  },
];

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
      <p className="slash-kicker">基本ブロック</p>
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={item.title}
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
        );
      })}
    </div>
  );
});

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowedPrefixes: [" ", "\n"],
        startOfLine: false,
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          return slashItems.filter(
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
