export const COVER_PREFIX = "preset:";

export type CoverPreset = {
  id: string;
  name: string;
  css: string;
};

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: "welcome",
    name: "ようこそ",
    css: "radial-gradient(80% 120% at 0% 100%, rgba(0, 182, 158, 0.22), transparent 60%), radial-gradient(70% 100% at 100% 0%, rgba(37, 140, 219, 0.16), transparent 58%), #f3f1eb",
  },
  {
    id: "dawn",
    name: "朝",
    css: "radial-gradient(75% 110% at 8% 100%, rgba(255, 176, 122, 0.32), transparent 58%), radial-gradient(65% 90% at 100% 8%, rgba(255, 214, 170, 0.28), transparent 55%), #f6f2ea",
  },
  {
    id: "haze",
    name: "霞",
    css: "radial-gradient(80% 115% at 0% 90%, rgba(176, 154, 214, 0.22), transparent 60%), radial-gradient(70% 100% at 95% 0%, rgba(122, 168, 214, 0.18), transparent 56%), #f4f2f6",
  },
  {
    id: "sprout",
    name: "若葉",
    css: "radial-gradient(78% 118% at 4% 100%, rgba(126, 188, 138, 0.26), transparent 58%), radial-gradient(68% 95% at 100% 6%, rgba(196, 220, 168, 0.22), transparent 54%), #f3f4ec",
  },
  {
    id: "peach",
    name: "桃",
    css: "radial-gradient(82% 120% at 0% 100%, rgba(242, 168, 176, 0.26), transparent 60%), radial-gradient(70% 100% at 100% 0%, rgba(255, 214, 196, 0.28), transparent 55%), #f7f1ee",
  },
  {
    id: "moon",
    name: "月",
    css: "radial-gradient(80% 115% at 10% 100%, rgba(148, 168, 188, 0.2), transparent 58%), radial-gradient(72% 100% at 100% 4%, rgba(210, 218, 228, 0.35), transparent 56%), #eef0f3",
  },
  {
    id: "honey",
    name: "蜜",
    css: "radial-gradient(78% 112% at 0% 95%, rgba(232, 186, 96, 0.26), transparent 58%), radial-gradient(66% 92% at 96% 8%, rgba(244, 214, 150, 0.24), transparent 54%), #f6f1e4",
  },
  {
    id: "rain",
    name: "雨",
    css: "radial-gradient(84% 120% at 6% 100%, rgba(110, 160, 184, 0.22), transparent 60%), radial-gradient(70% 98% at 100% 0%, rgba(168, 196, 210, 0.2), transparent 55%), #eef2f4",
  },
  {
    id: "silk",
    name: "絹",
    css: "radial-gradient(76% 110% at 0% 88%, rgba(232, 214, 196, 0.4), transparent 58%), radial-gradient(68% 96% at 100% 10%, rgba(236, 224, 216, 0.35), transparent 54%), #f7f4ef",
  },
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
    css: "linear-gradient(118deg, #ffd7a8 0%, #db5825 42%, #9a2b0e 100%)",
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

