import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { expiryLabel, permissionLabel } from "../lib/format";
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
  expiresAt?: string | number | Date | null;
};

type ExpiresIn = "7d" | "30d" | "never";

export function ShareDialog({ page, onClose }: Props) {
  const [acls, setAcls] = useState<AclRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [wsPerm, setWsPerm] = useState<Permission>("full");
  const [shareLinksEnabled, setShareLinksEnabled] = useState(true);
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("30d");
  const [copied, setCopied] = useState("");

  async function load() {
    const data = await api<{ acls: AclRow[]; links: LinkRow[]; shareLinksEnabled?: boolean }>(
      `/api/pages/${page.id}/acl`,
    );
    setAcls(data.acls);
    setLinks(data.links);
    setShareLinksEnabled(data.shareLinksEnabled !== false);
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
    try {
      const res = await api<{ url: string }>(`/api/pages/${page.id}/share-links`, {
        method: "POST",
        body: JSON.stringify({ permission, expiresIn }),
      });
      await navigator.clipboard.writeText(res.url);
      setCopied(res.url);
      toast("リンクをコピーしました");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "発行できませんでした");
    }
  }

  return (
    <Modal title="共有" onClose={onClose}>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">親から継承されます。ここで上書きできます。</p>
      <label className="field">
        <span>ワークスペース成員</span>
        <select value={wsPerm} onChange={(e) => saveWsPerm(e.target.value as Permission)}>
          <option value="full">フルアクセス</option>
          <option value="edit">編集可</option>
          <option value="view">閲覧のみ</option>
          <option value="none">アクセスなし</option>
        </select>
      </label>
      <h3 className="mb-2 mt-5 text-[13px] font-medium">公開リンク</h3>
      {!shareLinksEnabled ? (
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          設定のチームで公開リンクがオフです。既存のリンクも開けません。
        </p>
      ) : (
        <>
          <label className="field">
            <span>期限</span>
            <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value as ExpiresIn)}>
              <option value="7d">7日</option>
              <option value="30d">30日</option>
              <option value="never">無期限</option>
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
        </>
      )}
      {copied && <p className="mb-2 break-all text-[12px] text-cf">コピーしました</p>}
      {links.length > 0 && (
        <>
          <ul className="max-h-40 divide-y divide-line overflow-auto rounded-[10px] border border-line text-[13px]">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-muted">
                  {permissionLabel(l.permission)} · {expiryLabel(l.expiresAt)} · {l.token.slice(0, 8)}…
                </span>
                <button
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] text-danger hover:bg-hover"
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
          <button
            type="button"
            className="mt-2 text-[12px] text-danger hover:underline"
            onClick={async () => {
              await api(`/api/pages/${page.id}/share-links`, { method: "DELETE" });
              await load();
            }}
          >
            すべて無効化
          </button>
        </>
      )}
    </Modal>
  );
}
