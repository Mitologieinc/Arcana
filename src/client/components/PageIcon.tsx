export function isFileIcon(icon: string | null | undefined) {
  return Boolean(icon?.startsWith("file:"));
}

export function fileIconId(icon: string) {
  return icon.slice("file:".length);
}

export function PageIcon({
  icon,
  fallback = "📄",
  size = 16,
  className = "",
}: {
  icon?: string | null;
  fallback?: string;
  size?: number;
  className?: string;
}) {
  if (isFileIcon(icon)) {
    return (
      <img
        src={`/api/files/${fileIconId(icon!)}`}
        alt=""
        className={`inline-block shrink-0 rounded-[3px] object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`} style={{ fontSize: size, width: size, height: size }}>
      {icon || fallback}
    </span>
  );
}
