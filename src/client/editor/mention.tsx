import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { isChangeOrigin } from "@tiptap/extension-collaboration";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { NodeViewWrapper, ReactNodeViewRenderer, ReactRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { api } from "../lib/api";
import type { Member } from "../lib/types";
import { Avatar } from "../components/Avatar";

export type AtItem =
  | { kind: "user"; userId: string; name: string }
  | { kind: "page"; id: string; title: string; icon: string | null };

type Handle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

let memberCache: { at: number; members: Member[] } | null = null;

async function loadMembers() {
  if (memberCache && Date.now() - memberCache.at < 30_000) return memberCache.members;
  try {
    const d = await api<{ members: Member[] }>("/api/members");
    memberCache = { at: Date.now(), members: d.members };
    return d.members;
  } catch {
    return [];
  }
}

function UserMentionView({ node }: ReactNodeViewProps) {
  const name = String(node.attrs.name || "不明");
  return (
    <NodeViewWrapper as="span" className="user-mention" data-user-id={String(node.attrs.userId ?? "")}>
      @{name}
    </NodeViewWrapper>
  );
}

export const UserMention = Node.create({
  name: "userMention",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      userId: { default: "" },
      name: { default: "不明" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-user-id].user-mention" }];
  },
  renderHTML({ HTMLAttributes }) {
    const name = HTMLAttributes.name || "不明";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-user-id": HTMLAttributes.userId,
        class: "user-mention",
      }),
      `@${name}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.name || "不明"}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(UserMentionView, { as: "span" });
  },
});

const AtMenu = forwardRef<Handle, SuggestionProps<AtItem, AtItem>>(function AtMenu(props, ref) {
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
        <p className="slash-kicker">メンション</p>
        <p className="px-2.5 pb-3 text-[13px] text-muted">見つかりません</p>
      </div>
    );
  }
  return (
    <div className="slash-menu menu-panel">
      {items.map((item, i) => {
        const prev = items[i - 1];
        const kicker = item.kind !== prev?.kind ? (item.kind === "user" ? "メンバー" : "ページ") : null;
        return (
          <div key={item.kind === "user" ? `u-${item.userId}` : `p-${item.id}`}>
            {kicker && <p className="slash-kicker">{kicker}</p>}
            <button
              type="button"
              className={`slash-item ${i === index ? "is-active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => props.command(item)}
            >
              {item.kind === "user" ? (
                <>
                  <Avatar name={item.name} seed={item.userId} size={20} />
                  <span className="truncate text-[14px]">{item.name}</span>
                </>
              ) : (
                <>
                  <span className="slash-icon text-[16px] leading-none">{item.icon || "📄"}</span>
                  <span className="truncate text-[14px]">{item.title || "無題"}</span>
                </>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
});

export type AtMentionOptions = { pageId: string };

const atMentionKey = new PluginKey("atMention");

export const AtMention = Extension.create<AtMentionOptions>({
  name: "atMention",
  addOptions() {
    return { pageId: "" };
  },
  addProseMirrorPlugins() {
    const pageId = this.options.pageId;
    return [
      Suggestion<AtItem, AtItem>({
        editor: this.editor,
        pluginKey: atMentionKey,
        char: "@",
        allowedPrefixes: null,
        shouldShow: ({ transaction }) => !isChangeOrigin(transaction),
        items: async ({ query }) => {
          const q = query.trim().toLowerCase();
          const members = await loadMembers();
          const people = members
            .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
            .slice(0, 6)
            .map((m) => ({ kind: "user" as const, userId: m.userId, name: m.name }));
          let pages: AtItem[] = [];
          try {
            if (!q) {
              const list = await api<{ pages: { id: string; title: string; icon: string | null }[] }>("/api/pages");
              pages = list.pages.slice(0, 4).map((p) => ({ kind: "page", id: p.id, title: p.title, icon: p.icon }));
            } else {
              const res = await api<{ results: { id: string; title: string; icon: string | null }[] }>(
                `/api/search?q=${encodeURIComponent(query.trim())}`,
              );
              pages = res.results.slice(0, 6).map((p) => ({ kind: "page", id: p.id, title: p.title, icon: p.icon }));
            }
          } catch {
            pages = [];
          }
          return [...people, ...pages];
        },
        command: ({ editor, range, props }) => {
          if (props.kind === "user") {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({ type: "userMention", attrs: { userId: props.userId, name: props.name } })
              .insertContent(" ")
              .run();
            if (pageId && props.userId) {
              void api(`/api/pages/${pageId}/mentions`, {
                method: "POST",
                body: JSON.stringify({ userIds: [props.userId] }),
              }).catch(() => undefined);
            }
            return;
          }
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: "pageLink", attrs: { id: props.id, title: props.title || "無題" } })
            .insertContent(" ")
            .run();
        },
        render: () => {
          let component: ReactRenderer<Handle, SuggestionProps<AtItem, AtItem>> | null = null;
          let unmount: (() => void) | undefined;
          return {
            onStart: (props) => {
              component = new ReactRenderer(AtMenu, { editor: props.editor, props });
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
