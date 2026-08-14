export function BrandMark({ size = 18 }: { size?: number }) {
  return <span className="cf-mark" style={{ width: size, height: size }} aria-hidden />;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">Bible</div>
        {!compact && <div className="mt-0.5 text-[11px] text-muted">Self-hosted on Cloudflare</div>}
      </div>
    </div>
  );
}
