import { avatarTone, initials } from "../lib/format";

export function Avatar({
  name,
  seed,
  size = 22,
}: {
  name: string;
  seed?: string;
  size?: number;
}) {
  const px = `${size}px`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink"
      style={{
        width: px,
        height: px,
        fontSize: Math.max(9, size * 0.42),
        background: avatarTone(seed || name),
      }}
    >
      {initials(name)}
    </span>
  );
}
