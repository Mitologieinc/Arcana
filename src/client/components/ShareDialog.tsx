import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Page, Permission } from "../lib/types";
import { Modal } from "./Modal";

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
    <Modal title="共有" onClose={onClose}>
      <p className="mb-4 text-[13px] text-muted">権限は親ページから継承されます。ここで上書きできます。</p>
      <label className="field">
        <span>ワークスペース成員</span>
        <select value={wsPerm} onChange={(e) => saveWsPerm(e.target.value as Permission)}>
          <option value="full">フルアクセス</option>
          <option value="edit">編集可</option>
          <option value="view">閲覧のみ</option>
          <option value="none">アクセスなし</option>
        </select>
      </label>
      <div className="mb-3 flex gap-2">
        <button className="btn btn-secondary flex-1" onClick={() => createLink("view")}>
          閲覧リンク
        </button>
        <button className="btn btn-primary flex-1" onClick={() => createLink("edit")}>
          編集リンク
        </button>
      </div>
      {copied && <p className="mb-2 break-all text-[12px] text-cf">コピーしました: {copied}</p>}
      {links.length > 0 && (
        <ul className="max-h-40 divide-y divide-line overflow-auto border border-line text-[13px]">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between px-3 py-2">
              <span>
                {l.permission === "edit" ? "編集" : "閲覧"} · {l.token.slice(0, 8)}…
              </span>
              <button
                className="text-danger"
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
    </Modal>
  );
}
