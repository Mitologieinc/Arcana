import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../lib/api";
import type { Page, Permission } from "../lib/types";

type Props = {
  page: Page;
  onClose: () => void;
};

type AclRow = {
  id: string;
  principalType: "user" | "workspace" | "link";
  principalId: string | null;
  permission: Permission;
};

type LinkRow = {
  id: string;
  token: string;
  permission: Permission;
};

export function ShareDialog({ page, onClose }: Props) {
  const [acls, setAcls] = useState<AclRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [wsPerm, setWsPerm] = useState<Permission>("full");
  const [copied, setCopied] = useState("");

  async function load() {
    const data = await api<{ acls: AclRow[]; links: LinkRow[] }>(`/api/pages/${page.id}/acl`);
    setAcls(data.acls);
    setLinks(data.links);
    const ws = data.acls.find((a) => a.principalType === "workspace");
    setWsPerm(ws?.permission ?? "full");
  }

  useEffect(() => {
    load().catch(console.error);
  }, [page.id]);

  async function saveWsPerm(permission: Permission) {
    setWsPerm(permission);
    const next = acls.filter((a) => a.principalType !== "workspace");
    next.push({
      id: "tmp",
      principalType: "workspace",
      principalId: null,
      permission,
    });
    await api(`/api/pages/${page.id}/acl`, {
      method: "PUT",
      body: JSON.stringify({
        acls: next.map((a) => ({
          principalType: a.principalType,
          principalId: a.principalId,
          permission: a.permission,
        })),
      }),
    });
    await load();
  }

  async function createLink(permission: Permission) {
    const res = await api<{ url: string }>(`/api/pages/${page.id}/share-links`, {
      method: "POST",
      body: JSON.stringify({ permission }),
    });
    await navigator.clipboard.writeText(res.url);
    setCopied(res.url);
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">共有</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">権限は親ページから継承されます。ここで上書きできます。</p>
        <label className="mb-4 block text-sm">
          ワークスペース成員
          <select
            className="mt-1 w-full rounded border border-line px-2 py-1"
            value={wsPerm}
            onChange={(e) => saveWsPerm(e.target.value as Permission)}
          >
            <option value="full">フルアクセス</option>
            <option value="edit">編集可</option>
            <option value="view">閲覧のみ</option>
            <option value="none">アクセスなし</option>
          </select>
        </label>
        <div className="mb-3 flex gap-2">
          <button className="flex-1 rounded-md bg-sidebar px-3 py-2 text-sm" onClick={() => createLink("view")}>
            閲覧リンクをコピー
          </button>
          <button className="flex-1 rounded-md bg-ink px-3 py-2 text-sm text-white" onClick={() => createLink("edit")}>
            編集リンクをコピー
          </button>
        </div>
        {copied && <p className="mb-2 break-all text-xs text-accent">コピーしました: {copied}</p>}
        {links.length > 0 && (
          <ul className="max-h-40 overflow-auto text-sm">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between border-t border-line py-1">
                <span>
                  {l.permission === "edit" ? "編集" : "閲覧"} · {l.token.slice(0, 8)}…
                </span>
                <button
                  className="text-red-600"
                  onClick={async () => {
                    await api(`/api/share-links/${l.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  無効化
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
