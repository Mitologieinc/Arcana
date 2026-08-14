import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 pt-20 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`border border-line bg-white shadow-[0_16px_48px_rgba(0,0,0,0.12)] ${wide ? "w-full max-w-lg" : "w-full max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <button className="btn-ghost p-1 text-muted" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
