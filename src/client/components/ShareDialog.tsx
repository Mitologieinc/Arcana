import { useEffect, useMemo, useState } from "react";
import { Check, Globe, Link2, Plus, Trash2, Users, X } from "lucide-react";
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
  const viewLink = links.find((l) => l.permission === "view") ?? links[0];

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

  async function copyView() {
    if (viewLink) await copyText(shareUrl(viewLink.token));
    else await createLink("view");
  }

  return (
    <Modal title="共有" hideHeader flush onClose={onClose}>
      <div className="share-sheet">
        <header className="share-sheet-head">
          <div className="min-w-0">
            <p className="share-sheet-kicker">Share</p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
              <span className="share-sheet-icon">
                <PageIcon icon={page.icon} fallback={pageTypeIcon(page.type)} size={22} />
              </span>
              <h2 className="truncate text-[17px] font-semibold tracking-tight">{page.title || "無題"}</h2>
            </div>
          </div>
          <button type="button" className="share-sheet-x" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </header>

        <section className="share-sheet-card">
          <div className="mb-3 flex items-start gap-2.5">
            <span className="share-sheet-badge">
              <Globe size={14} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">公開リンク</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                {shareLinksEnabled
                  ? "リンクを知っている人だけが開けます"
                  : "設定で公開リンクがオフです"}
              </p>
            </div>
          </div>
          {shareLinksEnabled ? (
            <>
              <label className="share-sheet-field">
                <span>期限</span>
                <select className="share-select share-select-block" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value as ExpiresIn)}>
                  <option value="7d">7日</option>
                  <option value="30d">30日</option>
                  <option value="never">無期限</option>
                </select>
              </label>
              <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => void copyView()}>
                {copied && viewLink && copied === shareUrl(viewLink.token) ? <Check size={15} /> : <Link2 size={15} />}
                {viewLink ? "リンクをコピー" : "閲覧リンクをコピー"}
              </button>
              <button type="button" className="share-sheet-quiet mt-2" onClick={() => void createLink("edit")}>
                編集できるリンクも作る
              </button>
            </>
          ) : null}
        </section>

        {links.length > 0 && (
          <section>
            <p className="share-sheet-label">発行済み</p>
            <ul className="space-y-2">
              {links.map((l) => {
                const url = shareUrl(l.token);
                const isCopied = copied === url;
                return (
                  <li key={l.id} className="share-sheet-link">
                    <p className="text-[13px] font-medium">
                      {permissionLabel(l.permission)}
                      <span className="font-normal text-muted"> · {expiryLabel(l.expiresAt)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">{url.replace(/^https?:\/\//, "")}</p>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <button type="button" className="btn btn-secondary h-8 text-[12px]" onClick={() => void copyText(url)}>
                        {isCopied ? <Check size={13} /> : null}
                        {isCopied ? "コピー済" : "コピー"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary h-8 text-[12px] text-danger"
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
            </ul>
            {links.length > 1 && (
              <button
                type="button"
                className="share-sheet-quiet mt-2"
                onClick={async () => {
                  await api(`/api/pages/${page.id}/share-links`, { method: "DELETE" });
                  await load();
                }}
              >
                すべて無効化
              </button>
            )}
          </section>
        )}

        <section>
          <p className="share-sheet-label">アクセス</p>
          <div className="share-sheet-row">
            <span className="share-sheet-badge">
              <Users size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">ワークスペース</p>
              <p className="text-[12px] text-muted">{wsPerm === "none" ? "招待した人だけ" : "全員"}</p>
            </div>
            <select
              className="share-select"
              value={wsPerm}
              disabled={!canManageAcl}
              onChange={(e) => saveWsPerm(e.target.value as Permission)}
            >
              {permOptions()}
            </select>
          </div>
        </section>

        <section>
          <p className="share-sheet-label">人</p>
          {people.length > 0 && (
            <ul className="mb-2 space-y-1">
              {people.map((p) => {
                const member = members.find((m) => m.userId === p.principalId);
                const name = member?.name ?? "不明";
                const self = p.principalId === userId;
                return (
                  <li key={p.principalId} className="share-sheet-row">
                    <Avatar name={name} seed={p.principalId ?? name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{name}</p>
                      {self ? <p className="text-[12px] text-muted">あなた</p> : null}
                    </div>
                    <select
                      className="share-select"
                      value={p.permission}
                      disabled={!canManageAcl}
                      onChange={(e) => void savePerson(p.principalId!, e.target.value as Permission)}
                    >
                      {permOptions()}
                    </select>
                    {canManageAcl && (
                      <button
                        type="button"
                        className="share-sheet-x is-ghost"
                        title="外す"
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
            <div className="share-sheet-card space-y-2">
              <select className="share-select share-select-block" value={addId} onChange={(e) => setAddId(e.target.value)}>
                <option value="">メンバーを選ぶ</option>
                {addable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                    {m.userId === userId ? "（あなた）" : ""}
                  </option>
                ))}
              </select>
              <select className="share-select share-select-block" value={addPerm} onChange={(e) => setAddPerm(e.target.value as Permission)}>
                {permOptions()}
              </select>
              <button type="button" className="btn btn-secondary w-full" disabled={!addId} onClick={() => void addPerson()}>
                <Plus size={14} />
                追加
              </button>
            </div>
          )}
          {people.length === 0 && !canManageAcl && (
            <p className="text-[13px] text-muted">個別に上書きしている人はいません。</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
