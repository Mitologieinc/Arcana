import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} className="text-muted" />
          <input
            autoFocus
            className="flex-1 border-none py-3 outline-none"
            placeholder="ページを検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <ul className="max-h-80 overflow-auto p-2">
          {results.map((r) => (
            <li key={r.id}>
              <button
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-sidebar"
                onClick={() => onOpen(r.id)}
              >
                <span>{r.icon || "📄"}</span>
                <span>
                  <span className="block text-sm">{r.title || "無題"}</span>
                  {r.snippet && <span className="block text-xs text-muted">{r.snippet}</span>}
                </span>
              </button>
            </li>
          ))}
          {q && results.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-muted">見つかりませんでした</li>
          )}
        </ul>
      </div>
    </div>
  );
}
