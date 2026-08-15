import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function SideSheet({
  title,
  onClose,
  width = 400,
  extra,
  footer,
  flush,
  zIndex = 40,
  children,
}: {
  title: string;
  onClose: () => void;
  width?: number;
  extra?: ReactNode;
  footer?: ReactNode;
  flush?: boolean;
  zIndex?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex justify-end" style={{ zIndex }}>
      <button className="flex-1 bg-[rgba(15,15,15,0.08)]" onClick={onClose} aria-label="閉じる" />
      <aside
        className="arcana-sheet flex h-full flex-col border-l border-line bg-white"
        style={{ width: `min(${width}px, 92vw)` }}
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
          <span className="min-w-0 flex-1 text-[14px] font-medium">{title}</span>
          {extra}
          <button className="btn-ghost h-7 w-7 p-0 text-muted" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </header>
        <div className={flush ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "min-h-0 flex-1 overflow-auto"}>
          {children}
        </div>
        {footer}
      </aside>
    </div>
  );
}
