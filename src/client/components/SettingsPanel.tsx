import { useEffect, useState } from "react";
import { Fingerprint, Import, KeyRound, LayoutTemplate, Monitor, Moon, Sun, Trash2, Users } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { toast } from "../lib/toast";
import { roleLabel } from "../lib/format";
import { SideSheet } from "./SideSheet";
import { Avatar } from "./Avatar";
import { NotionImport } from "./NotionImport";
import { ConfirmModal } from "./ConfirmModal";
import type { Member, MemberRole, SavedTemplate, User, Workspace } from "../lib/types";

type Confirm =
  | { kind: "remove"; userId: string; name: string }
  | { kind: "leave"; name: string }
  | { kind: "transfer"; userId: string; name: string }
  | { kind: "template"; id: string; name: string };

const ROLE_ORDER: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2, guest: 3 };

function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === "owner") return ["admin", "member", "guest"];
  if (actor === "admin") return ["member", "guest"];
  return [];
}

function canEditRole(actor: MemberRole, target: MemberRole) {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return target === "member" || target === "guest";
  return false;
}

function canRemoveMember(actor: MemberRole, target: MemberRole, self: boolean) {
  if (target === "owner") return false;
  if (self) return actor !== "owner";
  if (actor === "owner") return true;
  if (actor === "admin") return target === "member" || target === "guest";
  return false;
}

function canResetMemberPassword(actor: MemberRole, target: MemberRole, self: boolean) {
  if (self) return false;
  if (target === "owner") return false;
  if (actor === "owner") return true;
  if (actor === "admin") return target === "member" || target === "guest";
  return false;
}

type PasskeyRow = {
  id: string;
  name?: string | null;
  aaguid?: string | null;
  createdAt?: Date | string | null;
  deviceType?: string;
};

type Tab = "account" | "appearance" | "team" | "templates" | "import";

export function SettingsPanel({
  user,
  members,
  workspace,
  role,
  onClose,
  onChanged,
  onSignOut,
}: {
  user: User;
  members: Member[];
  workspace: Workspace;
  role: MemberRole;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
  onSignOut: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("account");
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [pkError, setPkError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(Boolean(workspace.inviteOnly));
  const [allowedDomains, setAllowedDomains] = useState(workspace.allowedDomains ?? "");
  const [shareLinksEnabled, setShareLinksEnabled] = useState(workspace.shareLinksEnabled !== false);
  const [accessSaved, setAccessSaved] = useState("");
  const [accessError, setAccessError] = useState("");
  const [shareSaved, setShareSaved] = useState("");
  const [shareError, setShareError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [transferId, setTransferId] = useState("");
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [tplError, setTplError] = useState("");
  const canInvite = role === "owner" || role === "admin";
  const canManageTemplates = role !== "guest";
  const roleOptions = assignableRoles(role);
  const sortedMembers = [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "ja"),
  );
  const transferTargets = sortedMembers.filter((m) => m.userId !== user.id && m.role !== "guest");

  async function loadPasskeys() {
    const { data, error: err } = await authClient.passkey.listUserPasskeys();
    if (err) {
      setPkError(err.message || "パスキーを取得できませんでした");
      return;
    }
    setPasskeys((data as PasskeyRow[]) ?? []);
  }

  useEffect(() => {
    void loadPasskeys();
  }, []);

  useEffect(() => {
    if (tab !== "templates") return;
    api<{ templates: SavedTemplate[] }>("/api/templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, [tab]);

  async function renameTemplate(id: string) {
    const name = renameName.trim();
    if (!name) {
      setRenameId(null);
      return;
    }
    try {
      const d = await api<{ template: SavedTemplate }>(`/api/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setTemplates((prev) => prev.map((t) => (t.id === id ? d.template : t)));
      setRenameId(null);
      setTplError("");
    } catch (e) {
      setTplError(e instanceof Error ? e.message : "名前を変えられませんでした");
    }
  }

  async function deleteTemplate(id: string) {
    try {
      await api(`/api/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setTplError("");
      toast("テンプレートを削除しました");
    } catch (e) {
      setTplError(e instanceof Error ? e.message : "削除できませんでした");
    }
  }

  useEffect(() => {
    setInviteOnly(Boolean(workspace.inviteOnly));
    setAllowedDomains(workspace.allowedDomains ?? "");
    setShareLinksEnabled(workspace.shareLinksEnabled !== false);
  }, [workspace.inviteOnly, workspace.allowedDomains, workspace.shareLinksEnabled]);

  async function invite() {
    setError("");
    try {
      const res = await api<{ url: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setInviteUrl(res.url);
      await navigator.clipboard.writeText(res.url);
      toast("招待リンクをコピーしました");
      setEmail("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
    }
  }

  async function changeRole(userId: string, next: MemberRole) {
    setError("");
    try {
      await api(`/api/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role: next }) });
      toast("役割を変更しました");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更できませんでした");
    }
  }

  async function removeMember(userId: string, left: boolean) {
    setError("");
    try {
      await api(`/api/members/${userId}`, { method: "DELETE" });
      if (left) {
        toast("ワークスペースを退出しました");
        await onSignOut();
        return;
      }
      toast("メンバーから外しました");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "外せませんでした");
    }
  }

  async function transferOwner(userId: string) {
    setError("");
    try {
      await api(`/api/members/${userId}/transfer`, { method: "POST" });
      toast("オーナーを移しました");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "移譲できませんでした");
    }
  }

  async function addPasskey() {
    setPkError("");
    const { error: err } = await authClient.passkey.addPasskey({ name: "このデバイス" });
    if (err) {
      setPkError(err.message || "登録できませんでした");
      return;
    }
    await loadPasskeys();
  }

  async function removePasskey(id: string) {
    const { error: err } = await authClient.passkey.deletePasskey({ id });
    if (err) {
      setPkError(err.message || "削除できませんでした");
      return;
    }
    await loadPasskeys();
  }

  async function changePassword() {
    setPwError("");
    if (newPassword.length < 8) {
      setPwError("パスワードは 8 文字以上にしてください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("確認用と一致しません");
      return;
    }
    setPwBusy(true);
    try {
      await api("/api/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("パスワードを変更しました");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "変更できませんでした");
    } finally {
      setPwBusy(false);
    }
  }

  async function issueReset(userId: string) {
    setError("");
    try {
      const res = await api<{ url: string }>(`/api/members/${userId}/reset-link`, { method: "POST" });
      await navigator.clipboard.writeText(res.url);
      toast("リセットリンクをコピーしました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行できませんでした");
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Monitor }[] = [
    { id: "account", label: "アカウント", icon: Fingerprint },
    { id: "appearance", label: "表示", icon: Monitor },
    { id: "team", label: "チーム", icon: Users },
    { id: "templates", label: "テンプレ", icon: LayoutTemplate },
  ];
  if (canInvite) tabs.push({ id: "import", label: "移行", icon: Import });

  return (
    <>
    <SideSheet
      title="設定"
      width={560}
      flush
      zIndex={50}
      onClose={() => (confirm ? setConfirm(null) : onClose())}
    >
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[148px] shrink-0 flex-col gap-0.5 overflow-auto border-r border-line p-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex h-8 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] ${
                  tab === item.id ? "bg-hover font-medium" : "text-muted hover:bg-hover hover:text-ink"
                }`}
                onClick={() => setTab(item.id)}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-auto px-5 py-4">
          {tab === "account" && (
            <div className="space-y-6">
              <section className="flex items-center gap-3">
                <Avatar name={user.name} seed={user.id} size={48} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{user.name}</p>
                  <p className="truncate text-[13px] text-muted">{user.email}</p>
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-[13px] font-medium">パスキー</h3>
                <p className="mb-3 text-[12px] leading-relaxed text-muted">このデバイスの指紋や顔でログインできます。</p>
                <button type="button" className="btn btn-secondary mb-3" onClick={addPasskey}>
                  <Fingerprint size={15} />
                  パスキーを追加
                </button>
                {pkError && <p className="mb-3 text-[13px] text-danger">{pkError}</p>}
                <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                  {passkeys.length === 0 && (
                    <li className="px-3 py-6 text-center text-[13px] text-muted">まだパスキーはありません</li>
                  )}
                  {passkeys.map((pk) => (
                    <li key={pk.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{pk.name || "パスキー"}</span>
                        {pk.deviceType && <span className="text-[12px] text-muted">{pk.deviceType}</span>}
                      </span>
                      <button
                        className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-danger"
                        onClick={() => removePasskey(pk.id)}
                        title="削除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1 text-[13px] font-medium">パスワード</h3>
                <p className="mb-3 text-[12px] leading-relaxed text-muted">メールで入るときのパスワードです。変更すると他の端末のログインは切れます。</p>
                <label className="field">
                  <span>現在のパスワード</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>新しいパスワード</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>確認</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                {pwError && <p className="mb-3 text-[13px] text-danger">{pwError}</p>}
                <button type="button" className="btn btn-secondary" disabled={pwBusy} onClick={() => void changePassword()}>
                  パスワードを変更
                </button>
              </section>

              <button type="button" className="text-[13px] text-muted hover:text-ink" onClick={() => void onSignOut()}>
                ログアウト
              </button>
            </div>
          )}

          {tab === "appearance" && (
            <div>
              <h3 className="mb-1 text-[13px] font-medium">テーマ</h3>
              <p className="mb-3 text-[12px] text-muted">画面の明るさ</p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["light", "ライト", Sun, "#fff", "#f7f6f3"],
                    ["dark", "ダーク", Moon, "#191919", "#2a2a28"],
                  ] as const
                ).map(([id, label, Icon, page, rail]) => (
                  <button
                    key={id}
                    type="button"
                    className={`overflow-hidden rounded-[10px] border text-left ${
                      theme === id ? "border-ink" : "border-line hover:bg-hover"
                    }`}
                    onClick={() => {
                      document.documentElement.dataset.theme = id;
                      localStorage.setItem("arcana.theme", id);
                      setTheme(id);
                    }}
                  >
                    <span className="flex h-16 overflow-hidden">
                      <span className="w-6 shrink-0" style={{ background: rail }} />
                      <span className="flex-1" style={{ background: page }} />
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-2 text-[13px]">
                      <Icon size={14} />
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "team" && (
            <div className="space-y-7">
              <section>
                <h3 className="mb-1 text-[13px] font-medium">{workspace.name}</h3>
                <p className="text-[12px] text-muted">
                  {members.length} 人 · 人数に上限はありません
                </p>
              </section>

              {canInvite && (
                <section className="space-y-3">
                  <h3 className="text-[13px] font-medium">参加</h3>
                  <div className="grid gap-2">
                    {(
                      [
                        [true, "招待リンクがある人だけ"],
                        [false, "URL を知っていれば参加できる"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={String(value)}
                        type="button"
                        className={`btn btn-secondary h-auto min-h-9 w-full justify-start py-2 text-left text-[13px] ${
                          inviteOnly === value ? "ring-1 ring-ink" : ""
                        }`}
                        onClick={() => setInviteOnly(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="field mb-0">
                    <span>許可するメールドメイン（任意）</span>
                    <input
                      value={allowedDomains}
                      placeholder="example.com, company.co.jp"
                      onChange={(e) => setAllowedDomains(e.target.value)}
                    />
                  </label>
                  <p className="text-[12px] text-muted">カンマ区切り。空なら制限しません。ゲスト招待は対象外です。</p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      setAccessError("");
                      setAccessSaved("");
                      try {
                        await api("/api/workspace", {
                          method: "PATCH",
                          body: JSON.stringify({ inviteOnly, allowedDomains }),
                        });
                        setAccessSaved("保存しました");
                        await onChanged();
                      } catch (e) {
                        setAccessError(e instanceof Error ? e.message : "保存できませんでした");
                      }
                    }}
                  >
                    参加設定を保存
                  </button>
                  {accessSaved && <p className="text-[13px] text-muted">{accessSaved}</p>}
                  {accessError && <p className="text-[13px] text-danger">{accessError}</p>}
                </section>
              )}

              {canInvite && (
                <section className="space-y-3">
                  <h3 className="text-[13px] font-medium">公開リンク</h3>
                  <p className="text-[12px] text-muted">
                    オフにすると、ページの共有リンクは新規発行できず、既存のものも開けなくなります。
                  </p>
                  <div className="grid gap-2">
                    {(
                      [
                        [true, "ページごとに発行できる"],
                        [false, "すべて無効（外部から開けない）"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={String(value)}
                        type="button"
                        className={`btn btn-secondary h-auto min-h-9 w-full justify-start py-2 text-left text-[13px] ${
                          shareLinksEnabled === value ? "ring-1 ring-ink" : ""
                        }`}
                        onClick={() => setShareLinksEnabled(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      setShareError("");
                      setShareSaved("");
                      try {
                        await api("/api/workspace", {
                          method: "PATCH",
                          body: JSON.stringify({ shareLinksEnabled }),
                        });
                        setShareSaved("保存しました");
                        await onChanged();
                      } catch (e) {
                        setShareError(e instanceof Error ? e.message : "保存できませんでした");
                      }
                    }}
                  >
                    公開リンク設定を保存
                  </button>
                  {shareSaved && <p className="text-[13px] text-muted">{shareSaved}</p>}
                  {shareError && <p className="text-[13px] text-danger">{shareError}</p>}
                </section>
              )}

              <section>
                <h3 className="mb-3 text-[13px] font-medium">メンバー</h3>
                {error && <p className="mb-3 text-[13px] text-danger">{error}</p>}
                <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                  {sortedMembers.map((m) => {
                    const self = m.userId === user.id;
                    const editable = canEditRole(role, m.role);
                    const removable = canRemoveMember(role, m.role, self);
                    const resettable = canResetMemberPassword(role, m.role, self);
                    return (
                      <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                        <Avatar name={m.name} seed={m.userId} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {m.name}
                            {self ? "（あなた）" : ""}
                          </span>
                          <span className="block truncate text-[12px] text-muted">{m.email}</span>
                        </span>
                        {editable ? (
                          <select
                            className="input h-8 w-[7.5rem] shrink-0 text-[12px]"
                            value={m.role}
                            onChange={(e) => void changeRole(m.userId, e.target.value as MemberRole)}
                          >
                            {roleOptions.map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="shrink-0 text-[12px] text-muted">{roleLabel(m.role)}</span>
                        )}
                        {resettable && (
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
                            title="リセットリンク"
                            onClick={() => void issueReset(m.userId)}
                          >
                            <KeyRound size={14} />
                          </button>
                        )}
                        {removable && (
                          <button
                            type="button"
                            className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-danger"
                            title={self ? "退出" : "外す"}
                            onClick={() =>
                              setConfirm(
                                self
                                  ? { kind: "leave", name: workspace.name }
                                  : { kind: "remove", userId: m.userId, name: m.name },
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {role === "owner" && transferTargets.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-[13px] font-medium">オーナー移譲</h3>
                  <p className="text-[12px] leading-relaxed text-muted">
                    移すと、あなたは管理者になります。ゲストには移せません。
                  </p>
                  <div className="flex gap-2">
                    <select
                      className="input min-w-0 flex-1"
                      value={transferId}
                      onChange={(e) => setTransferId(e.target.value)}
                    >
                      <option value="">相手を選ぶ</option>
                      {transferTargets.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary shrink-0"
                      disabled={!transferId}
                      onClick={() => {
                        const m = transferTargets.find((x) => x.userId === transferId);
                        if (m) setConfirm({ kind: "transfer", userId: m.userId, name: m.name });
                      }}
                    >
                      移す
                    </button>
                  </div>
                </section>
              )}

              {canInvite && (
                <section className="space-y-2">
                  <h3 className="text-[13px] font-medium">招待</h3>
                  <input
                    className="input"
                    placeholder="招待するメール"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <select
                      className="input w-32 shrink-0"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                    >
                      <option value="member">メンバー</option>
                      <option value="admin">管理者</option>
                      <option value="guest">ゲスト</option>
                    </select>
                    <button className="btn btn-secondary min-w-0 flex-1" onClick={invite}>
                      招待リンクを発行
                    </button>
                  </div>
                  {inviteUrl && <p className="break-all text-[12px] text-cf">コピー済み: {inviteUrl}</p>}
                  {error && <p className="text-[13px] text-danger">{error}</p>}
                </section>
              )}
            </div>
          )}

          {tab === "import" && canInvite && <NotionImport onChanged={onChanged} />}

          {tab === "templates" && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-1 text-[13px] font-medium">ページのテンプレート</h3>
                <p className="mb-3 text-[12px] leading-relaxed text-muted">
                  ページの「その他」から保存できます。空のページでチップとして出ます。
                </p>
                {tplError && <p className="mb-3 text-[13px] text-danger">{tplError}</p>}
                <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                  {templates.length === 0 && (
                    <li className="px-3 py-6 text-center text-[13px] text-muted">まだありません</li>
                  )}
                  {templates.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0">{t.icon || "📄"}</span>
                        {renameId === t.id ? (
                          <input
                            className="input h-7 min-w-0 flex-1 text-[13px]"
                            autoFocus
                            value={renameName}
                            maxLength={80}
                            onChange={(e) => setRenameName(e.target.value)}
                            onBlur={() => void renameTemplate(t.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void renameTemplate(t.id);
                              }
                              if (e.key === "Escape") setRenameId(null);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="min-w-0 truncate text-left font-medium"
                            onClick={() => {
                              if (!canManageTemplates) return;
                              setRenameId(t.id);
                              setRenameName(t.name);
                            }}
                          >
                            {t.name}
                          </button>
                        )}
                      </span>
                      {canManageTemplates && (
                        <button
                          className="shrink-0 rounded-md p-1 text-muted hover:bg-hover hover:text-danger"
                          onClick={() => setConfirm({ kind: "template", id: t.id, name: t.name })}
                          title="削除"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </SideSheet>
      {confirm?.kind === "remove" && (
        <ConfirmModal
          title="メンバーから外す"
          body={`${confirm.name} はワークスペースに入れなくなります。ページの個別権限も消えます。`}
          confirmLabel="外す"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.userId;
            setConfirm(null);
            void removeMember(id, false);
          }}
        />
      )}
      {confirm?.kind === "leave" && (
        <ConfirmModal
          title="退出"
          body={`${confirm.name} から退出します。招待されるまで戻れません。`}
          confirmLabel="退出"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void removeMember(user.id, true);
          }}
        />
      )}
      {confirm?.kind === "transfer" && (
        <ConfirmModal
          title="オーナーを移す"
          body={`${confirm.name} がオーナーになります。あなたは管理者になります。`}
          confirmLabel="移す"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.userId;
            setConfirm(null);
            void transferOwner(id);
          }}
        />
      )}
      {confirm?.kind === "template" && (
        <ConfirmModal
          title="テンプレートを削除"
          body={`${confirm.name} を消します。すでに作ったページはそのままです。`}
          confirmLabel="削除"
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            void deleteTemplate(id);
          }}
        />
      )}
    </>
  );
}
