export const COVER_PREFIX = "preset:";

export type CoverPreset = {
  id: string;
  name: string;
  css: string;
};

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "sunset",
    name: "夕焼け",
    css: "linear-gradient(115deg, #ffb088 0%, #f08060 42%, #c44b4b 100%)",
  },
  {
    id: "sakura",
    name: "桜",
    css: "linear-gradient(120deg, #ffe4ec 0%, #f5b6c8 48%, #e38aa3 100%)",
  },
  {
    id: "sand",
    name: "砂浜",
    css: "linear-gradient(118deg, #f6e6c8 0%, #e8c992 50%, #c9a06a 100%)",
  },
  {
    id: "forest",
    name: "新緑",
    css: "linear-gradient(125deg, #c8e6c0 0%, #7ebc8a 46%, #3f7a58 100%)",
  },
  {
    id: "lake",
    name: "湖",
    css: "linear-gradient(120deg, #c5e8ef 0%, #6eb4c8 48%, #2f6f88 100%)",
  },
  {
    id: "sky",
    name: "青空",
    css: "linear-gradient(160deg, #d7ecff 0%, #7eb6ea 55%, #3b7cc4 100%)",
  },
  {
    id: "lavender",
    name: "藤",
    css: "linear-gradient(122deg, #e6d9f5 0%, #b79ad4 48%, #7a5aa3 100%)",
  },
  {
    id: "night",
    name: "夜空",
    css: "linear-gradient(135deg, #3d4560 0%, #2a3148 48%, #151820 100%)",
  },
  {
    id: "ember",
    name: "灯火",
    css: "linear-gradient(118deg, #ffd7a8 0%, #e85d04 42%, #9a2b0e 100%)",
  },
  {
    id: "mist",
    name: "霧",
    css: "linear-gradient(180deg, #eceae4 0%, #d5d2c8 55%, #b7b3a8 100%)",
  },
  {
    id: "maple",
    name: "紅葉",
    css: "linear-gradient(115deg, #ffd0a8 0%, #e07a3d 46%, #9c3b22 100%)",
  },
  {
    id: "deep",
    name: "深海",
    css: "linear-gradient(130deg, #4f8f9a 0%, #2b5d6e 48%, #12343f 100%)",
  },
];

export function isCoverPreset(key: string | null | undefined) {
  return Boolean(key?.startsWith(COVER_PREFIX));
}

export function coverPreset(key: string | null | undefined) {
  if (!key?.startsWith(COVER_PREFIX)) return undefined;
  return COVER_PRESETS.find((c) => c.id === key.slice(COVER_PREFIX.length));
}

export function presetCoverKey(id: string) {
  return `${COVER_PREFIX}${id}`;
}

export function CoverVisual({
  cover,
  className,
}: {
  cover: string;
  className?: string;
}) {
  const preset = coverPreset(cover);
  if (preset) {
    return <div className={className} style={{ background: preset.css }} role="img" aria-label={preset.name} />;
  }
  return <img src={`/api/files/${cover}`} alt="" className={className} />;
}

export function CoverPicker({
  onPick,
  onUpload,
}: {
  onPick: (id: string) => void;
  onUpload: () => void;
}) {
  return (
    <>
      <p className="px-1.5 pb-2 text-[11px] font-medium text-muted">ギャラリー</p>
      <div className="grid grid-cols-4 gap-1.5">
        {COVER_PRESETS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.name}
            className="overflow-hidden rounded-[6px] ring-offset-1 hover:ring-2 hover:ring-[rgba(55,53,47,0.2)]"
            onClick={() => onPick(c.id)}
          >
            <span className="block h-12 w-full" style={{ background: c.css }} />
            <span className="block truncate px-1 py-1 text-left text-[11px] text-muted">{c.name}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] text-muted hover:bg-hover"
        onClick={onUpload}
      >
        画像をアップロード
      </button>
    </>
  );
}

