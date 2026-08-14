import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useState } from "react";

const EMOJIS = ["💡", "✅", "⚠️", "❌", "🔥", "📝", "💬", "⭐"];

function CalloutView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const [open, setOpen] = useState(false);
  return (
    <NodeViewWrapper
      className={`arcana-callout ${selected ? "is-selected" : ""}`}
      data-type="callout"
      data-emoji={node.attrs.emoji}
    >
      <button
        type="button"
        className="arcana-callout-emoji"
        contentEditable={false}
        onClick={() => setOpen((v) => !v)}
      >
        {node.attrs.emoji || "💡"}
      </button>
      {open && (
        <div className="menu-panel arcana-callout-picker" contentEditable={false}>
          {EMOJIS.map((emo) => (
            <button
              key={emo}
              type="button"
              className="rounded-[6px] p-1.5 text-[18px] hover:bg-hover"
              onClick={() => {
                updateAttributes({ emoji: emo });
                setOpen(false);
              }}
            >
              {emo}
            </button>
          ))}
        </div>
      )}
      <NodeViewContent className="arcana-callout-body" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return {
      emoji: { default: "💡" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "arcana-callout" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
