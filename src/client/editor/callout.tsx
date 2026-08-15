import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useState } from "react";
import { EmojiPicker } from "../components/EmojiPicker";
import { useEditorChrome } from "./chrome";

function calloutTone(emoji: string) {
  if (/💡|✨|🧠|💭/.test(emoji)) return "idea";
  if (/⚠️|🚧|⚡|❓/.test(emoji)) return "warn";
  if (/❌|🔥|☠️|🚨|💀|⛔/.test(emoji)) return "danger";
  if (/✅|☑️|🎉/.test(emoji)) return "ok";
  if (/💬|📝|ℹ️|📌|📎/.test(emoji)) return "info";
  return "neutral";
}

function CalloutView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const chrome = useEditorChrome();
  const [open, setOpen] = useState(false);
  const emoji = (node.attrs.emoji as string) || "💡";
  const canEdit = chrome?.editable ?? false;
  return (
    <NodeViewWrapper
      className={`arcana-callout ${selected ? "is-selected" : ""}`}
      data-type="callout"
      data-emoji={emoji}
      data-tone={calloutTone(emoji)}
    >
      {canEdit ? (
      <button
        type="button"
        className="arcana-callout-emoji"
        contentEditable={false}
        onClick={() => setOpen((v) => !v)}
      >
        {emoji}
      </button>
      ) : (
        <span className="arcana-callout-emoji" contentEditable={false}>
          {emoji}
        </span>
      )}
      {open && (
        <div
          className="menu-panel arcana-callout-picker"
          contentEditable={false}
          onClick={(e) => e.stopPropagation()}
        >
          <EmojiPicker
            onPick={(emo) => {
              updateAttributes({ emoji: emo });
              setOpen(false);
            }}
          />
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
  renderHTML({ node, HTMLAttributes }) {
    const emoji = (node.attrs.emoji as string) || "💡";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        "data-emoji": emoji,
        "data-tone": calloutTone(emoji),
        class: "arcana-callout",
      }),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
