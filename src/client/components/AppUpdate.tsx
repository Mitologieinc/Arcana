import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

type Commit = { sha: string; short: string; message: string; date: string; url: string };

type UpdateInfo = {
  repo: string;
  current: { version: string; commit: string; short: string; builtAt: string };
  latest: Commit | null;
  status: "current" | "behind" | "ahead" | "unknown";
  behindBy?: number;
  aheadBy?: number;
  commits: Commit[];
  compareUrl: string;
};

function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AppUpdate() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      setInfo(await api<UpdateInfo>("/api/app/update"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "確認できませんでした");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const status = info?.status;
  const banner =
    status === "behind"
      ? `GitHub に新しい更新が ${info?.behindBy ? `${info.behindBy} 件` : ""}あります。`
      : status === "current"
        ? "この環境は最新です。"
        : status === "ahead"
          ? "この環境は GitHub より先に進んでいます。"
          : "いま動いている版と GitHub を照合できませんでした。";

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 text-[13px] font-medium">アプリの更新</h3>
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          GitHub の <span className="font-medium text-ink">{info?.repo ?? "Mitologieinc/Arcana"}</span> を見て、取り込み忘れがないか確認します。
        </p>
        <div className="rounded-[10px] border border-line px-3 py-3">
          <p className="text-[13px] font-medium">{banner}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-muted">いまの版</dt>
            <dd>
              {info?.current.version ?? "—"}
              {info?.current.short ? ` · ${info.current.short}` : ""}
              {info?.current.builtAt ? ` · ${when(info.current.builtAt)}` : ""}
            </dd>
            <dt className="text-muted">GitHub</dt>
            <dd>
              {info?.latest ? (
                <>
                  {info.latest.short}
                  {info.latest.date ? ` · ${when(info.latest.date)}` : ""}
                  <span className="mt-0.5 block text-muted">{info.latest.message}</span>
                </>
              ) : (
                "取得できませんでした"
              )}
            </dd>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
              <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
              再確認
            </button>
            {info?.compareUrl && (
              <a className="btn btn-secondary" href={info.compareUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                差分を見る
              </a>
            )}
          </div>
          {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        </div>
      </section>

      {info?.commits.length ? (
        <section>
          <h3 className="mb-2 text-[13px] font-medium">最近のコミット</h3>
          <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
            {info.commits.map((c) => (
              <li key={c.sha}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-3 px-3 py-2.5 text-[13px] hover:bg-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.message}</span>
                    <span className="text-[12px] text-muted">
                      {c.short}
                      {c.date ? ` · ${when(c.date)}` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-1 text-[13px] font-medium">取り込み方</h3>
        <ol className="list-decimal space-y-2 pl-5 text-[12px] leading-relaxed text-muted">
          <li>
            CLI で出している場合は、リポジトリで <code className="rounded bg-hover px-1">git pull</code> してから{" "}
            <code className="rounded bg-hover px-1">npm run deploy</code>。
          </li>
          <li>
            GitHub Actions を入れている場合は、最新を <code className="rounded bg-hover px-1">main</code> に入れるか、Actions の「Deploy」を手動実行します。
          </li>
          <li>ワンタップで出した環境は、フォークを upstream に同期すると Cloudflare が再デプロイします。</li>
        </ol>
      </section>
    </div>
  );
}
