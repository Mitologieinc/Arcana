import { useEffect, useMemo, useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { expiryLabel, pageTypeIcon, permissionLabel } from "../lib/format";
import type { Member, Page, Permission } from "../lib/types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { PageIcon } from "./PageIcon";

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

function shareUrl(token: string) {
  return `${location.origin}/share/${token}`;
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

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    toast("リンクをコピーしました");
  }

  async function createLink(permission: Permission) {
    try {
      const res = await api<{ url: string }>(`/api/pages/${page.id}/share-links`, {
        method: "POST",
        body: JSON.stringify({ permission, expiresIn }),
      });
      await copyText(res.url);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "発行できませんでした");
    }
  }

  return (
    <Modal title="共有" onClose={onClose}>
      <div className="mb-4 flex min-w-0 items-center gap-2.5">
        <PageIcon icon={page.icon} fallback={pageTypeIcon(page.type)} size={22} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{page.title || "無題"}</p>
          <p className="text-[12px] text-muted">このページを誰が見るか</p>
        </div>
      </div>

      <section className="mb-4">
        <h3 className="mb-1.5 text-[12px] font-medium text-muted">チーム</h3>
        <label className="field mb-0">
          <span>ワークスペースの全員</span>
          <select value={wsPerm} disabled={!canManageAcl} onChange={(e) => saveWsPerm(e.target.value as Permission)}>
            {permOptions()}
          </select>
        </label>
        {wsPerm === "none" && (
          <p className="mt-1.5 text-[12px] text-muted">足した人以外には見えません。</p>
        )}
      </section>

      <section className="mb-4">
        <h3 className="mb-1.5 text-[12px] font-medium text-muted">人</h3>
        {people.length > 0 && (
          <ul className="mb-2 space-y-2">
            {people.map((p) => {
              const member = members.find((m) => m.userId === p.principalId);
              const name = member?.name ?? "不明";
              const self = p.principalId === userId;
              return (
                <li key={p.principalId} className="rounded-[10px] border border-line px-3 py-2">
                  <div className="mb-2 flex min-w-0 items-center gap-2">
                    <Avatar name={name} seed={p.principalId ?? name} size={22} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {name}
                      {self ? <span className="text-muted">（あなた）</span> : ""}
                    </span>
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
                  </div>
                  <select
                    className="input"
                    value={p.permission}
                    disabled={!canManageAcl}
                    onChange={(e) => void savePerson(p.principalId!, e.target.value as Permission)}
                  >
                    {permOptions()}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
        {canManageAcl && addable.length > 0 && (
          <div className="space-y-2">
            <select className="input" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">メンバーを選ぶ</option>
              {addable.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === userId ? "（あなた）" : ""}
                </option>
              ))}
            </select>
            <select className="input" value={addPerm} onChange={(e) => setAddPerm(e.target.value as Permission)}>
              {permOptions()}
            </select>
            <button type="button" className="btn btn-secondary w-full" disabled={!addId} onClick={() => void addPerson()}>
              追加
            </button>
          </div>
        )}
        {people.length === 0 && !canManageAcl && (
          <p className="text-[13px] text-muted">個別に上書きしている人はいません。</p>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[12px] font-medium text-muted">公開リンク</h3>
        {!shareLinksEnabled ? (
          <p className="rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-[13px] leading-relaxed text-muted">
            設定のチームで公開リンクがオフです。既存のリンクも開けません。
          </p>
        ) : (
          <div className="space-y-2">
            <label className="field mb-0">
              <span>期限</span>
              <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value as ExpiresIn)}>
                <option value="7d">7日</option>
                <option value="30d">30日</option>
                <option value="never">無期限</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary w-full" onClick={() => void createLink("view")}>
              <Link2 size={14} />
              閲覧リンクを作ってコピー
            </button>
            <button type="button" className="btn btn-secondary w-full" onClick={() => void createLink("edit")}>
              編集リンクを作ってコピー
            </button>
          </div>
        )}
        {links.length > 0 && (
          <ul className="mt-3 space-y-2">
            {links.map((l) => {
              const url = shareUrl(l.token);
              const isCopied = copied === url;
              return (
                <li key={l.id} className="rounded-[10px] border border-line px-3 py-2.5">
                  <p className="text-[13px]">
                    {permissionLabel(l.permission)}
                    <span className="text-muted"> · {expiryLabel(l.expiresAt)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">{url.replace(/^https?:\/\//, "")}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn btn-secondary h-8 flex-1 text-[12px]" onClick={() => void copyText(url)}>
                      {isCopied ? "コピー済" : "コピー"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary h-8 flex-1 text-[12px] text-danger"
                      onClick={async () => {
                        await api(`/api/share-links/${l.id}`, { method: "DELETE" });
                        await load();
                      }}
                    >
                      無効化
                    </button>
                  </div>
                </li>
              );
            })}
            <button
              type="button"
              className="text-[12px] text-muted hover:text-danger"
              onClick={async () => {
                await api(`/api/pages/${page.id}/share-links`, { method: "DELETE" });
                await load();
              }}
            >
              すべて無効化
            </button>
          </ul>
        )}
      </section>
    </Modal>
  );
}
