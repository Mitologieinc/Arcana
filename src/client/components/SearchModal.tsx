import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { FilePlus, LayoutGrid, Search, StickyNote } from "lucide-react";
import { api } from "../lib/api";
import type { Page, PageType } from "../lib/types";
import { pageTypeIcon } from "../lib/format";
import { Modal } from "./Modal";
import { PageIcon } from "./PageIcon";

type Result = { id: string; title: string; icon: string | null; type: string; snippet: string };

type Row =
  | { key: string; kind: "page"; id: string; title: string; icon: string; snippet?: string }
  | { key: string; kind: "action"; title: string; subtitle: string; icon: PageType; run: () => void };

export function SearchModal({
  pages = [],
  onClose,
  onOpen,
  onCreate,
}: {
  pages?: Page[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onCreate: (type: PageType) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [index, setIndex] = useState(0);

  const recents = useMemo(
    () =>
      [...pages]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [pages],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      api<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.results))
        .catch(() => setResults([]));
    }, 160);
    return () => window.clearTimeout(t);
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const query = q.trim().toLowerCase();
    const actions: Row[] = (
      [
        {
          key: "new-page",
          kind: "action",
          title: "新規ページ",
          subtitle: "空のページを開く",
          icon: "page",
          run: () => onCreate("page"),
        },
        {
          key: "new-db",
          kind: "action",
          title: "新規データベース",
          subtitle: "テーブルを作る",
          icon: "database",
          run: () => onCreate("database"),
        },
        {
          key: "new-canvas",
          kind: "action",
          title: "新規キャンバス",
          subtitle: "付箋と図を置く",
          icon: "canvas",
          run: () => onCreate("canvas"),
        },
      ] as const satisfies readonly Row[]
    ).filter(
      (a) =>
        !query ||
        a.title.toLowerCase().includes(query) ||
        a.subtitle.toLowerCase().includes(query) ||
        (a.icon === "page" && "page".includes(query)) ||
        (a.icon === "database" && ("db".includes(query) || "データベース".includes(query))) ||
        (a.icon === "canvas" && ("canvas".includes(query) || "キャンバス".includes(query) || "miro".includes(query))),
    );

    const pageRows: Row[] = (query ? results : recents).map((p) => ({
      key: p.id,
      kind: "page",
      id: p.id,
      title: p.title || "無題",
      icon: p.icon || pageTypeIcon(p.type),
      snippet: "snippet" in p ? p.snippet : undefined,
    }));

    return [...actions, ...pageRows];
  }, [q, results, recents, onCreate]);

  useEffect(() => setIndex(0), [rows.length, q]);

  function run(row: Row | undefined) {
    if (!row) return;
    if (row.kind === "action") row.run();
    else onOpen(row.id);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1) % Math.max(rows.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i + rows.length - 1) % Math.max(rows.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(rows[index]);
    }
  }

  return (
    <Modal title="検索" onClose={onClose} wide hideHeader>
      <div className="flex items-center gap-2.5 border-b border-line px-3.5">
        <Search size={16} className="text-muted" />
        <input
          autoFocus
          className="h-12 flex-1 border-none bg-transparent text-[16px] outline-none"
          placeholder="検索または入力して作成…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <kbd className="kbd">esc</kbd>
      </div>
      <ul className="max-h-80 overflow-auto py-1.5">
        {rows.map((row, i) => (
          <li key={row.key}>
            <button
              className={`flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[14px] ${
                i === index ? "bg-hover" : "hover:bg-hover"
              }`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(row)}
            >
              {row.kind === "action" ? (
                <span className="flex h-6 w-6 items-center justify-center text-muted">
                  {row.icon === "page" ? <FilePlus size={15} /> : row.icon === "canvas" ? <StickyNote size={15} /> : <LayoutGrid size={15} />}
                </span>
              ) : (
                <span className="flex h-6 w-6 items-center justify-center">
                  <PageIcon icon={row.icon} size={15} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${row.kind === "page" && row.title === "無題" ? "text-muted" : ""}`}>
                  {row.title}
                </span>
                {row.kind === "action" && (
                  <span className="block truncate text-[12px] text-muted">{row.subtitle}</span>
                )}
                {row.kind === "page" && row.snippet && (
                  <span className="block truncate text-[12px] text-muted">{row.snippet}</span>
                )}
              </span>
            </button>
          </li>
        ))}
        {q && rows.length === 0 && (
          <li className="px-3 py-10 text-center text-[14px] text-muted">見つかりませんでした</li>
        )}
      </ul>
    </Modal>
  );
}
