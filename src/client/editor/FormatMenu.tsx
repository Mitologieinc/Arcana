import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { Link2, Palette } from "lucide-react";

const TEXT_COLORS: { name: string; value: string | null }[] = [
  { name: "デフォルト", value: null },
  { name: "グレー", value: "#787774" },
  { name: "ブラウン", value: "#9f6b53" },
  { name: "オレンジ", value: "#d9730d" },
  { name: "イエロー", value: "#cb912f" },
  { name: "グリーン", value: "#448361" },
  { name: "ブルー", value: "#337ea9" },
  { name: "パープル", value: "#9065b0" },
  { name: "ピンク", value: "#c14c8a" },
  { name: "レッド", value: "#d44c47" },
];

const BG_COLORS: { name: string; value: string | null }[] = [
  { name: "デフォルト", value: null },
  { name: "グレー", value: "#ebeced" },
  { name: "ブラウン", value: "#e9e5e3" },
  { name: "オレンジ", value: "#fadec9" },
  { name: "イエロー", value: "#fdecc8" },
  { name: "グリーン", value: "#dbeddb" },
  { name: "ブルー", value: "#d3e5ef" },
  { name: "パープル", value: "#e8deee" },
  { name: "ピンク", value: "#f5e0e9" },
  { name: "レッド", value: "#ffe2dd" },
];

function applyLink(editor: Editor, raw: string) {
  const next = raw.trim();
  if (!next) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  if (!/^(https?:\/\/|\/|#|mailto:)/i.test(next)) return;
  editor.chain().focus().setLink({ href: next }).run();
}

export function ColorButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        title="色"
        className={open ? "is-active" : ""}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette size={14} />
      </button>
      {open && (
        <div
          className="menu-panel absolute left-0 top-9 z-50 w-48 p-1.5"
          onMouseDown={(e) => e.preventDefault()}
        >
          <p className="slash-kicker">文字色</p>
          <div className="mb-1 grid grid-cols-5 gap-0.5 px-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] hover:bg-hover"
                onClick={() => {
                  if (c.value) editor.chain().focus().setColor(c.value).run();
                  else editor.chain().focus().unsetColor().run();
                  setOpen(false);
                }}
              >
                <span className="text-[13px] font-semibold" style={{ color: c.value ?? "var(--color-ink)" }}>
                  A
                </span>
              </button>
            ))}
          </div>
          <p className="slash-kicker">背景</p>
          <div className="grid grid-cols-5 gap-0.5 px-1 pb-1">
            {BG_COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] hover:bg-hover"
                onClick={() => {
                  if (c.value) editor.chain().focus().toggleHighlight({ color: c.value }).run();
                  else editor.chain().focus().unsetHighlight().run();
                  setOpen(false);
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-[3px] text-[11px] font-semibold"
                  style={{ background: c.value ?? "transparent", color: "var(--color-ink)" }}
                >
                  A
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

export function LinkButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);

  return (
    <span className="relative">
      <button
        type="button"
        title="リンク"
        className={editor.isActive("link") || open ? "is-active" : ""}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setHref((editor.getAttributes("link").href as string | undefined) ?? "");
          setOpen((v) => !v);
        }}
      >
        <Link2 size={14} />
      </button>
      {open && (
        <div className="menu-panel absolute left-0 top-9 z-50 w-64 p-2" onMouseDown={(e) => e.preventDefault()}>
          <input
            autoFocus
            className="mb-1.5 h-8 w-full rounded-[6px] bg-canvas px-2 text-[13px] outline-none"
            placeholder="https://"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyLink(editor, href);
                setOpen(false);
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 rounded-[6px] px-2 py-1.5 text-[12px] hover:bg-hover"
              onClick={() => {
                applyLink(editor, href);
                setOpen(false);
              }}
            >
              適用
            </button>
            {editor.isActive("link") && (
              <button
                type="button"
                className="rounded-[6px] px-2 py-1.5 text-[12px] text-danger hover:bg-hover"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setOpen(false);
                }}
              >
                解除
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
