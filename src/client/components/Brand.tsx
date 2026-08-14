import mark from "../assets/arcana-mark.png";
import lockup from "../assets/arcana-logo.png";

export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return <img src={mark} alt="Arcana" className={`object-contain ${className}`} />;
}

export function BrandLockup({ className = "h-10 w-auto" }: { className?: string }) {
  return <img src={lockup} alt="Arcana WorkSquare" className={`object-contain object-left ${className}`} />;
}

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return compact ? (
    <BrandMark className={className ?? "h-8 w-8"} />
  ) : (
    <BrandLockup className={className ?? "h-11 w-auto"} />
  );
}
