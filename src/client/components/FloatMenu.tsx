import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../lib/media";

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
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
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
  }, [onClose, isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isMobile, onClose]);

  if (isMobile) {
    return createPortal(
      <div className="arcana-float-sheet fixed inset-0 z-50 flex flex-col justify-end">
        <button className="min-h-0 flex-1 bg-[rgba(15,15,15,0.28)]" onClick={onClose} aria-label="閉じる" />
        <div
          className="menu-panel max-h-[min(70dvh,520px)] w-full overflow-auto rounded-b-none rounded-t-[16px] p-2 pb-[max(12px,env(safe-area-inset-bottom,0px))]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
          {children}
        </div>
      </div>,
      document.body,
    );
  }

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
