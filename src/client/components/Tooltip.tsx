import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Tooltip({
  label,
  children,
  delay = 280,
}: {
  label: string;
  children: ReactNode;
  delay?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function place() {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const tip = tipRef.current?.getBoundingClientRect();
    const w = tip?.width ?? Math.min(220, label.length * 12 + 24);
    const h = tip?.height ?? 28;
    const pad = 8;
    let left = r.left + r.width / 2;
    left = Math.min(window.innerWidth - pad - w / 2, Math.max(pad + w / 2, left));
    let top = r.bottom + 6;
    if (top + h + pad > window.innerHeight) top = r.top - h - 6;
    setPos({ top, left });
  }

  function show() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      place();
      setOpen(true);
    }, delay);
  }

  function hide() {
    window.clearTimeout(timer.current);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, label]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div
      ref={wrapRef}
      className="min-w-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className="arcana-tip"
            style={{ top: pos.top, left: pos.left }}
          >
            {label}
          </div>,
          document.body,
        )}
    </div>
  );
}
