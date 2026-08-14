import BoringAvatar from "boring-avatars";

const COLORS = ["#00b69e", "#258cdb", "#264653", "#2a9d8f", "#e9c46a"];

export function Avatar({
  name,
  seed,
  size = 22,
}: {
  name: string;
  seed?: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-full [&>svg]:block"
      style={{ width: size, height: size }}
      title={name}
    >
      <BoringAvatar name={seed || name || "?"} size={size} variant="marble" colors={COLORS} />
    </span>
  );
}
