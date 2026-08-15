import { useMemo, useState } from "react";
import { isSingleEmoji, searchEmojis } from "../lib/emojis";

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const cats = useMemo(() => searchEmojis(query), [query]);
  const typed = query.trim();
  const canUseTyped = isSingleEmoji(typed);

  return (
    <div className="flex max-h-[360px] flex-col">
      <input
        autoFocus
        className="mb-2 h-8 w-full rounded-[6px] border border-line bg-transparent px-2 text-[13px] outline-none placeholder:text-muted"
        placeholder="検索、または絵文字を貼る"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canUseTyped) {
            e.preventDefault();
            onPick(typed);
          }
        }}
      />
      {canUseTyped && (
        <button
          type="button"
          className="mb-2 flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
          onClick={() => onPick(typed)}
        >
          <span className="text-[20px]">{typed}</span>
          これを使う
        </button>
      )}
      <div className="min-h-0 flex-1 overflow-auto pr-0.5">
        {cats.length === 0 && <p className="px-1 py-3 text-[12px] text-muted">見つかりません。絵文字を貼って Enter でも使えます。</p>}
        {cats.map((cat) => (
          <div key={cat.name} className="mb-2">
            {query.trim() === "" && cats.length > 1 && (
              <p className="px-1 pb-1 text-[11px] font-medium text-muted">{cat.name}</p>
            )}
            <div className="grid grid-cols-8 gap-0.5">
              {cat.items.map((item, i) => (
                <button
                  key={`${item.e}-${i}`}
                  type="button"
                  title={item.k}
                  className="flex aspect-square items-center justify-center rounded-[6px] text-[20px] leading-none hover:bg-hover"
                  onClick={() => onPick(item.e)}
                >
                  {item.e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
