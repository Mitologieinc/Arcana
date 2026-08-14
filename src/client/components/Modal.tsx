import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,15,15,0.35)] px-4 pt-[13vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`modal-panel menu-panel ${wide ? "w-full max-w-[620px]" : "w-full max-w-[440px]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between px-4 pt-3.5">
            <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
            <button className="btn-ghost h-7 w-7 p-0 text-muted" onClick={onClose} aria-label="閉じる">
              <X size={16} />
            </button>
          </div>
        )}
        <div className={hideHeader ? "p-1.5" : "px-4 pb-5 pt-3"}>{children}</div>
      </div>
    </div>
  );
}
