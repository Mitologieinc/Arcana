import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { FileText } from "lucide-react";

function FileBlockView({ node }: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const name = String(node.attrs.name || "ファイル");
  const mime = String(node.attrs.mime || "");
  if (mime.startsWith("video/")) {
    return (
      <NodeViewWrapper className="arcana-file-block" data-type="file-block">
        <video src={src} controls className="max-h-80 w-full rounded-[8px] bg-black" />
        <p className="mt-1 truncate text-[12px] text-muted">{name}</p>
      </NodeViewWrapper>
    );
  }
  if (mime.startsWith("audio/")) {
    return (
      <NodeViewWrapper className="arcana-file-block" data-type="file-block">
        <audio src={src} controls className="w-full" />
        <p className="mt-1 truncate text-[12px] text-muted">{name}</p>
      </NodeViewWrapper>
    );
  }
  if (mime === "application/pdf") {
    return (
      <NodeViewWrapper className="arcana-file-block" data-type="file-block">
        <iframe title={name} src={src} className="h-[420px] w-full rounded-[8px] border border-line bg-white" />
        <a className="mt-1 inline-block text-[12px] text-muted underline underline-offset-2" href={src} target="_blank" rel="noreferrer">
          {name}
        </a>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper className="arcana-file-block" data-type="file-block">
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-[8px] border border-line px-3 py-2 text-[13px] hover:bg-hover"
      >
        <FileText size={16} className="text-muted" />
        <span className="min-w-0 truncate">{name}</span>
      </a>
    </NodeViewWrapper>
  );
}

export const FileBlock = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: "" },
      name: { default: "ファイル" },
      mime: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="file-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "file-block" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileBlockView);
  },
});
