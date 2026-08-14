import { X } from "lucide-react";
import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide,
  hideHeader,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  hideHeader?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,15,15,0.4)] pt-[12vh]"
      onClick={onClose}
    >
      <div
        className={`overflow-hidden rounded-[10px] bg-white shadow-[0_14px_45px_-6px_rgba(0,0,0,0.18)] ${wide ? "w-full max-w-[600px]" : "w-full max-w-[420px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="text-[14px] font-medium">{title}</h2>
            <button className="btn-ghost h-7 w-7 p-0 text-muted" onClick={onClose} aria-label="閉じる">
              <X size={16} />
            </button>
          </div>
        )}
        <div className={hideHeader ? "p-2" : "px-4 pb-4 pt-3"}>{children}</div>
      </div>
    </div>
  );
}
