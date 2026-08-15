import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  wide,
  hideHeader,
  flush,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  hideHeader?: boolean;
  flush?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,15,15,0.18)] p-4"
      onClick={onClose}
    >
      <div
        className={`modal-panel menu-panel flex max-h-[min(720px,calc(100vh-2rem))] flex-col ${
          wide ? "w-full max-w-[720px]" : "w-full max-w-[440px]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <h2 className="text-[14px] font-medium">{title}</h2>
            <button className="btn-ghost h-7 w-7 p-0 text-muted" onClick={onClose} aria-label="閉じる">
              <X size={16} />
            </button>
          </div>
        )}
        <div
          className={
            hideHeader
              ? flush
                ? "min-h-0 overflow-hidden"
                : "p-1.5"
              : flush
                ? "min-h-0 flex-1 overflow-hidden"
                : "min-h-0 flex-1 overflow-auto px-4 py-4"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
