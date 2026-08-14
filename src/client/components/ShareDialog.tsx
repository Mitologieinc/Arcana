import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { expiryLabel, permissionLabel } from "../lib/format";
import type { Member, Page, Permission } from "../lib/types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";

type Props = {
  page: Page;
  members: Member[];
  userId: string;
  canManageAcl: boolean;
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

const PERMS: Permission[] = ["full", "edit", "view", "none"];

function permOptions() {
  return PERMS.map((p) => (
    <option key={p} value={p}>
      {permissionLabel(p)}
    </option>
  ));
}

export function ShareDialog({ page, members, userId, canManageAcl, onClose }: Props) {
  const [acls, setAcls] = useState<AclRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [wsPerm, setWsPerm] = useState<Permission>("full");
  const [shareLinksEnabled, setShareLinksEnabled] = useState(true);
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>("30d");
  const [copied, setCopied] = useState("");
  const [addId, setAddId] = useState("");
  const [addPerm, setAddPerm] = useState<Permission>("edit");

  const people = useMemo(
    () => acls.filter((a) => a.principalType === "user" && a.principalId),
    [acls],
  );
  const addable = members.filter((m) => !people.some((p) => p.principalId === m.userId));

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

  async function persist(nextPeople: AclRow[], workspacePerm = wsPerm) {
    await api(`/api/pages/${page.id}/acl`, {
      method: "PUT",
      body: JSON.stringify({
        acls: [
          ...nextPeople.map((a) => ({
            principalType: "user" as const,
            principalId: a.principalId,
            permission: a.permission,
          })),
          { principalType: "workspace" as const, principalId: null, permission: workspacePerm },
        ],
      }),
    });
    await load();
  }

  async function saveWsPerm(permission: Permission) {
    setWsPerm(permission);
    try {
      await persist(people, permission);
    } catch (e) {
      toast(e instanceof Error ? e.message : "変更できませんでした");
      await load();
    }
  }

  async function savePerson(principalId: string, permission: Permission) {
    const next = people.filter((p) => p.principalId !== principalId);
    next.push({
      id: "tmp",
      principalType: "user",
      principalId,
      permission,
    });
    try {
      await persist(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : "変更できませんでした");
    }
  }

  async function removePerson(principalId: string) {
    try {
      await persist(people.filter((p) => p.principalId !== principalId));
    } catch (e) {
      toast(e instanceof Error ? e.message : "外せませんでした");
    }
  }

  async function addPerson() {
    if (!addId) return;
    await savePerson(addId, addPerm);
    setAddId("");
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
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        親から継承されます。人を足すとその人だけ上書きします。ワークスペースをアクセスなしにすると、足した人以外は見えません。
      </p>
      <label className="field">
        <span>ワークスペース成員</span>
        <select
          value={wsPerm}
          disabled={!canManageAcl}
          onChange={(e) => saveWsPerm(e.target.value as Permission)}
        >
          {permOptions()}
        </select>
      </label>

      <h3 className="mb-2 mt-1 text-[13px] font-medium">人</h3>
      {people.length > 0 && (
        <ul className="mb-3 divide-y divide-line overflow-hidden rounded-[10px] border border-line text-[13px]">
          {people.map((p) => {
            const member = members.find((m) => m.userId === p.principalId);
            const name = member?.name ?? "不明";
            const self = p.principalId === userId;
            return (
              <li key={p.principalId} className="flex items-center gap-2 px-3 py-2">
                <Avatar name={name} seed={p.principalId ?? name} size={22} />
                <span className="min-w-0 flex-1 truncate">
                  {name}
                  {self ? "（あなた）" : ""}
                </span>
                <select
                  className="input h-8 w-[7.5rem] shrink-0 text-[12px]"
                  value={p.permission}
                  disabled={!canManageAcl}
                  onChange={(e) => void savePerson(p.principalId!, e.target.value as Permission)}
                >
                  {permOptions()}
                </select>
                {canManageAcl && (
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-danger"
                    title="上書きを外す"
                    onClick={() => void removePerson(p.principalId!)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManageAcl && addable.length > 0 && (
        <div className="mb-4 flex gap-2">
          <select className="input min-w-0 flex-1 text-[13px]" value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">メンバーを選ぶ</option>
            {addable.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
                {m.userId === userId ? "（あなた）" : ""}
              </option>
            ))}
          </select>
          <select
            className="input h-8 w-[7.5rem] shrink-0 text-[12px]"
            value={addPerm}
            onChange={(e) => setAddPerm(e.target.value as Permission)}
          >
            {permOptions()}
          </select>
          <button type="button" className="btn btn-secondary shrink-0" disabled={!addId} onClick={() => void addPerson()}>
            追加
          </button>
        </div>
      )}
      {people.length === 0 && !canManageAcl && (
        <p className="mb-4 text-[13px] text-muted">このページを上書きしている人はいません。</p>
      )}

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
