export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <span className="cf-mark" style={{ width: size, height: size, fontSize: size * 0.52 }} aria-hidden>
      B
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <BrandMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">Bible</div>
        {!compact && <div className="mt-0.5 text-[11px] text-muted">ワークスペース</div>}
      </div>
    </div>
  );
}
