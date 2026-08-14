const DIAMONDS = [
  { x: 130.757, y: 0.385742, fill: "#B60003" },
  { x: 203.825, y: 73.4531, fill: "#B60003" },
  { x: 130.935, y: 146.343, fill: "#B60003" },
  { x: 281.067, y: 0, fill: "#DB5825" },
  { x: 354.134, y: 73.0674, fill: "#DB5825" },
  { x: 281.245, y: 145.957, fill: "#DB5825" },
] as const;

const DELAY = [0, 2, 4, 1, 3, 5];

function ArcanaMark({
  className,
  animate = false,
  label = "Arcana",
}: {
  className?: string;
  animate?: boolean;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 412 263"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`arcana-logo ${animate ? "is-in" : ""} ${className ?? ""}`}
      role="img"
      aria-label={label}
    >
      {DIAMONDS.map((d, i) => (
        <g key={i} className="arcana-logo-d" style={{ animationDelay: `${DELAY[i] * 70}ms` }}>
          <rect
            x={d.x}
            y={d.y}
            width="81.8374"
            height="81.8374"
            transform={`rotate(45 ${d.x} ${d.y})`}
            fill={d.fill}
          />
        </g>
      ))}
    </svg>
  );
}

export function BrandMark({
  className = "h-8 w-auto",
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  return <ArcanaMark className={className} animate={animate} />;
}

export function BrandLockup({
  className = "h-10 w-auto",
  animate = true,
}: {
  className?: string;
  animate?: boolean;
}) {
  return <ArcanaMark className={className} animate={animate} label="Arcana WorkSquare" />;
}

export function Brand({
  compact = false,
  className,
  animate,
}: {
  compact?: boolean;
  className?: string;
  animate?: boolean;
}) {
  return compact ? (
    <BrandMark className={className ?? "h-8 w-auto"} animate={animate} />
  ) : (
    <BrandLockup className={className ?? "h-11 w-auto"} animate={animate ?? true} />
  );
}
