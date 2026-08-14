import mark from "../assets/arcana-mark.png";
import lockup from "../assets/arcana-logo.png";

export function BrandMark({ className = "h-8 w-8 rounded-lg" }: { className?: string }) {
  return <img src={mark} alt="Arcana" className={`bg-black object-cover ${className}`} />;
}

export function BrandLockup({ className = "h-10 w-auto rounded-lg" }: { className?: string }) {
  return <img src={lockup} alt="Arcana WorkSquare" className={`bg-black object-contain ${className}`} />;
}

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return compact ? (
    <BrandMark className={className ?? "h-8 w-8 rounded-lg"} />
  ) : (
    <BrandLockup className={className ?? "h-11 w-auto rounded-lg"} />
  );
}
