import { useState } from "react";
import { Import } from "lucide-react";
import { api } from "../lib/api";

type SearchItem = {
  id: string;
  object: "page" | "database";
  title: string;
  parent: { type: string; page_id?: string; database_id?: string };
};

function remember(map: Record<string, string>, notionId: string, arcanaId: string) {
  map[notionId] = arcanaId;
  map[notionId.replaceAll("-", "")] = arcanaId;
}

function lookup(map: Record<string, string>, notionId?: string) {
  if (!notionId) return undefined;
  return map[notionId] || map[notionId.replaceAll("-", "")];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function NotionImport({ onChanged }: { onChanged: () => Promise<unknown> }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  async function run() {
    setError("");
    setDoneId(null);
    setBusy(true);
    const key = token.trim();
    try {
      setStatus("接続を確認しています…");
      await api("/api/import/notion/whoami", { method: "POST", body: JSON.stringify({ token: key }) });

      setStatus("共有されているページを集めています…");
      const items: SearchItem[] = [];
      let cursor: string | null = null;
      do {
        const page = await api<{ results: SearchItem[]; next_cursor: string | null; has_more: boolean }>(
          "/api/import/notion/search",
          { method: "POST", body: JSON.stringify({ token: key, cursor }) },
        );
        items.push(...page.results);
        cursor = page.has_more ? page.next_cursor : null;
        await sleep(200);
      } while (cursor);

      const pages = items.filter((i) => i.object === "page" && i.parent.type !== "database_id");
      const databases = items.filter((i) => i.object === "database");
      const total = pages.length + databases.length;
      if (!total) throw new Error("共有されているページがありません。Notion でコネクションにページを追加してください。");

      setStatus("受け皿のページを作っています…");
      const root = await api<{ id: string }>("/api/import/notion/root", { method: "POST", body: JSON.stringify({}) });
      const idMap: Record<string, string> = {};
      const dbKeys: Record<string, Record<string, string>> = {};
      const createdPages: { notionId: string; id: string }[] = [];

      const parentIdFor = (item: SearchItem) => {
        if (item.parent.type === "page_id") return lookup(idMap, item.parent.page_id) ?? root.id;
        return root.id;
      };

      let remaining = [...databases, ...pages];
      let guard = 0;
      while (remaining.length && guard < remaining.length + 5) {
        guard += 1;
        const next: SearchItem[] = [];
        for (const item of remaining) {
          if (item.parent.type === "page_id" && !lookup(idMap, item.parent.page_id) && remaining.some((r) => r.id === item.parent.page_id)) {
            next.push(item);
            continue;
          }
          const parentId = parentIdFor(item);
          setStatus(`取り込んでいます（${Object.keys(idMap).length / 2 + 1} / ${total}）… ${item.title}`);
          if (item.object === "database") {
            const created = await api<{ id: string; keyMap: Record<string, string> }>("/api/import/notion/database", {
              method: "POST",
              body: JSON.stringify({ token: key, notionId: item.id, parentId }),
            });
            remember(idMap, item.id, created.id);
            dbKeys[item.id] = created.keyMap;
          } else {
            const created = await api<{ id: string }>("/api/import/notion/page", {
              method: "POST",
              body: JSON.stringify({ token: key, notionId: item.id, parentId }),
            });
            remember(idMap, item.id, created.id);
            createdPages.push({ notionId: item.id, id: created.id });
          }
          await sleep(150);
        }
        if (next.length === remaining.length) {
          for (const item of next) {
            const parentId = root.id;
            if (item.object === "database") {
              const created = await api<{ id: string; keyMap: Record<string, string> }>("/api/import/notion/database", {
                method: "POST",
                body: JSON.stringify({ token: key, notionId: item.id, parentId }),
              });
              remember(idMap, item.id, created.id);
              dbKeys[item.id] = created.keyMap;
            } else {
              const created = await api<{ id: string }>("/api/import/notion/page", {
                method: "POST",
                body: JSON.stringify({ token: key, notionId: item.id, parentId }),
              });
              remember(idMap, item.id, created.id);
              createdPages.push({ notionId: item.id, id: created.id });
            }
          }
          break;
        }
        remaining = next;
      }

      for (const db of databases) {
        const databaseId = lookup(idMap, db.id);
        const keyMap = dbKeys[db.id];
        if (!databaseId || !keyMap) continue;
        let rowCursor: string | null = null;
        do {
          setStatus(`データベース「${db.title}」の行を取り込んでいます…`);
          const chunk = await api<{ created: { notionId: string; id: string }[]; next_cursor: string | null; has_more: boolean }>(
            "/api/import/notion/rows",
            {
              method: "POST",
              body: JSON.stringify({ token: key, notionId: db.id, databaseId, cursor: rowCursor, keyMap }),
            },
          );
          for (const row of chunk.created) {
            remember(idMap, row.notionId, row.id);
            createdPages.push(row);
          }
          rowCursor = chunk.has_more ? chunk.next_cursor : null;
          await sleep(200);
        } while (rowCursor);
      }

      for (const db of databases) {
        const databaseId = lookup(idMap, db.id);
        if (!databaseId) continue;
        setStatus(`リレーションを繋いでいます… ${db.title}`);
        try {
          await api("/api/import/notion/relink", {
            method: "POST",
            body: JSON.stringify({ databaseId, idMap }),
          });
        } catch {
          /* 対象 DB が共有されていなければ空のまま */
        }
        await sleep(150);
      }

      let i = 0;
      for (const page of createdPages) {
        i += 1;
        setStatus(`本文を書いています（${i} / ${createdPages.length}）…`);
        try {
          await api("/api/import/notion/body", {
            method: "POST",
            body: JSON.stringify({ token: key, notionId: page.notionId, pageId: page.id, idMap }),
          });
        } catch {
          /* 1ページ失敗しても続ける */
        }
        await sleep(150);
      }

      await onChanged();
      setDoneId(root.id);
      setStatus(`完了しました。${createdPages.length} ページを「Notion から」に入れました。`);
      setToken("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 text-[13px] font-medium">Notion から引き継ぐ</h3>
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          <li>
            <a className="underline underline-offset-2" href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">
              Notion のインテグレーション
            </a>
            で Internal Integration を作り、Secret をコピーする
          </li>
          <li>引き継ぎたいページ（またはワークスペースの親）の ••• → 接続 → そのインテグレーションを追加する</li>
          <li>下に Secret を貼って取り込む。キーは保存しません。データベース同士のリレーションも、両方共有されていれば繋がります</li>
        </ol>
        <label className="field">
          <span>Internal Integration Secret</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="secret_ または ntn_ で始まるキー"
            value={token}
            disabled={busy}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-primary mt-3" disabled={busy || token.trim().length < 10} onClick={() => void run()}>
          <Import size={15} />
          {busy ? "取り込み中…" : "取り込む"}
        </button>
        {status && <p className="mt-3 text-[13px] text-muted">{status}</p>}
        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        {doneId && (
          <a className="mt-3 inline-block text-[13px] underline underline-offset-2" href={`/page/${doneId}`}>
            取り込んだページを開く
          </a>
        )}
      </section>
    </div>
  );
}
