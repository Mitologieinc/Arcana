import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState, type MouseEvent } from "react";
import { api } from "../lib/api";
import { useEditorChrome } from "./chrome";
import { PageIcon } from "../components/PageIcon";

type Hit = { id: string; title: string; icon: string | null };

function PageLinkView({ node }: ReactNodeViewProps) {
  const chrome = useEditorChrome();
  const id = String(node.attrs.id ?? "");
  return (
    <NodeViewWrapper
      as="span"
      className="page-link"
      data-page-id={id}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        if (id) chrome?.onOpenPage?.(id);
      }}
    >
      {node.attrs.title || "無題"}
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: { default: "" },
      title: { default: "無題" },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-page-id]" }, { tag: 'span[data-page-id].page-link' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href: `/page/${HTMLAttributes.id}`,
        "data-page-id": HTMLAttributes.id,
        class: "page-link",
      }),
      HTMLAttributes.title || "無題",
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView, { as: "span" });
  },
});

function PageBlockView({ node }: ReactNodeViewProps) {
  const chrome = useEditorChrome();
  const id = String(node.attrs.id ?? "");
  return (
    <NodeViewWrapper
      className="arcana-page-block"
      data-type="page-block"
      data-page-id={id}
      contentEditable={false}
      onClick={() => {
        if (id) chrome?.onOpenPage?.(id);
      }}
    >
      <PageIcon icon={String(node.attrs.icon || "")} size={16} />
      <span className="min-w-0 truncate font-medium">{node.attrs.title || "無題"}</span>
    </NodeViewWrapper>
  );
}

export const PageBlock = Node.create({
  name: "pageBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: "" },
      title: { default: "無題" },
      icon: { default: "📄" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="page-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-block",
        "data-page-id": HTMLAttributes.id,
        class: "arcana-page-block",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageBlockView);
  },
});

type Handle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const PageMenu = forwardRef<Handle, SuggestionProps<Hit, Hit>>(function PageMenu(props, ref) {
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
  if (!items.length) {
    return (
      <div className="slash-menu menu-panel">
        <p className="slash-kicker">ページ</p>
        <p className="px-2.5 pb-3 text-[13px] text-muted">見つかりません</p>
      </div>
    );
  }
  return (
    <div className="slash-menu menu-panel">
      <p className="slash-kicker">ページをリンク</p>
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          className={`slash-item ${i === index ? "is-active" : ""}`}
          onMouseEnter={() => setIndex(i)}
          onClick={() => props.command(item)}
        >
          <span className="slash-icon text-[16px]">{item.icon || "📄"}</span>
          <span className="truncate text-[14px]">{item.title || "無題"}</span>
        </button>
      ))}
    </div>
  );
});

const pageMentionKey = new PluginKey("pageMention");

export const PageMention = Extension.create({
  name: "pageMention",
  addProseMirrorPlugins() {
    return [
      Suggestion<Hit, Hit>({
        editor: this.editor,
        pluginKey: pageMentionKey,
        char: "@",
        allowedPrefixes: [" ", "\n"],
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        items: async ({ query }) => {
          const q = query.trim();
          if (!q) {
            const list = await api<{ pages: { id: string; title: string; icon: string | null }[] }>("/api/pages");
            return list.pages.slice(0, 8);
          }
          const res = await api<{ results: Hit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
          return res.results.slice(0, 8);
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: "pageLink", attrs: { id: props.id, title: props.title || "無題" } })
            .insertContent(" ")
            .run();
        },
        render: () => {
          let component: ReactRenderer<Handle, SuggestionProps<Hit, Hit>> | null = null;
          let unmount: (() => void) | undefined;
          return {
            onStart: (props) => {
              component = new ReactRenderer(PageMenu, { editor: props.editor, props });
              unmount = props.mount(component.element);
            },
            onUpdate: (props) => component?.updateProps(props),
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
