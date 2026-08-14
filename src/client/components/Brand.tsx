import logo from "../assets/arcana-logo.png";

export function BrandMark({ className = "h-7 w-auto" }: { className?: string }) {
  return <img src={logo} alt="Arcana" className={`bg-black object-contain ${className}`} />;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex justify-center">
      <BrandMark className={compact ? "h-10 w-auto rounded-[6px]" : "h-14 w-auto rounded-[8px]"} />
    </div>
  );
}
