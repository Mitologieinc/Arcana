import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { type MouseEvent } from "react";
import { useEditorChrome } from "./chrome";
import { PageIcon } from "../components/PageIcon";

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
