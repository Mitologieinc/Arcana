import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function FloatMenu({
  anchor,
  onClose,
  width,
  children,
}: {
  anchor: DOMRect;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    const close = () => onClose();
    const t = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  const top = Math.min(anchor.bottom + 4, window.innerHeight - 12);
  const left = Math.min(anchor.left, window.innerWidth - (width ?? 220) - 8);

  return createPortal(
    <div
      className="menu-panel fixed z-50 max-h-[min(320px,70vh)] overflow-auto p-1"
      style={{ top, left, width: width ?? Math.max(200, anchor.width) }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
