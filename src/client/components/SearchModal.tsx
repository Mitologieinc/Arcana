import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import { Modal } from "./Modal";

type Result = { id: string; title: string; icon: string | null; type: string; snippet: string };

export function SearchModal({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      api<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.results))
        .catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <Modal title="検索" onClose={onClose} wide hideHeader>
      <div className="flex items-center gap-2.5 border-b border-line px-3.5">
        <Search size={16} className="text-muted" />
        <input
          autoFocus
          className="h-12 flex-1 border-none bg-transparent text-[16px] outline-none"
          placeholder="ページを検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <kbd className="kbd ml-auto">esc</kbd>
      </div>
      <ul className="max-h-80 overflow-auto py-1.5">
        {results.map((r) => (
          <li key={r.id}>
            <button
              className="flex w-full items-start gap-2.5 rounded-[6px] px-3 py-2 text-left text-[14px] hover:bg-hover"
              onClick={() => onOpen(r.id)}
            >
              <span className="mt-0.5 text-[15px]">{r.icon || (r.type === "database" ? "🗃️" : "📄")}</span>
              <span className="min-w-0">
                <span className={`block truncate ${r.title ? "" : "text-muted"}`}>{r.title || "無題"}</span>
                {r.snippet && <span className="mt-0.5 block truncate text-[12px] text-muted">{r.snippet}</span>}
              </span>
            </button>
          </li>
        ))}
        {q && results.length === 0 && (
          <li className="px-3 py-10 text-center text-[14px] text-muted">見つかりませんでした</li>
        )}
        {!q && <li className="px-3 py-10 text-center text-[13px] text-muted">検索</li>}
      </ul>
    </Modal>
  );
}
