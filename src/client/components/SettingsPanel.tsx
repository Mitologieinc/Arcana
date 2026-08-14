import { useEffect, useState } from "react";
import { Fingerprint, Import, Monitor, Moon, Sun, Trash2, Users } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { roleLabel } from "../lib/format";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import { NotionImport } from "./NotionImport";
import type { Member, MemberRole, User, Workspace } from "../lib/types";

type PasskeyRow = {
  id: string;
  name?: string | null;
  aaguid?: string | null;
  createdAt?: Date | string | null;
  deviceType?: string;
};

type Tab = "account" | "appearance" | "team" | "import";

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
  const [inviteOnly, setInviteOnly] = useState(Boolean(workspace.inviteOnly));
  const [allowedDomains, setAllowedDomains] = useState(workspace.allowedDomains ?? "");
  const [accessSaved, setAccessSaved] = useState("");
  const [accessError, setAccessError] = useState("");
  const canInvite = role === "owner" || role === "admin";

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

  async function invite() {
    setError("");
    try {
      const res = await api<{ url: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setInviteUrl(res.url);
      await navigator.clipboard.writeText(res.url);
      setEmail("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "失敗しました");
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

  const tabs: { id: Tab; label: string; icon: typeof Monitor }[] = [
    { id: "account", label: "アカウント", icon: Fingerprint },
    { id: "appearance", label: "表示", icon: Monitor },
    { id: "team", label: "チーム", icon: Users },
  ];
  if (canInvite) tabs.push({ id: "import", label: "移行", icon: Import });

  return (
    <Modal title="設定" onClose={onClose} wide flush>
      <div className="flex min-h-[420px] max-h-[min(640px,calc(100vh-6rem))]">
        <nav className="flex w-[168px] shrink-0 flex-col gap-0.5 border-r border-line p-2">
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

              <section>
                <h3 className="mb-3 text-[13px] font-medium">メンバー</h3>
                <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
                  {members.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                      <Avatar name={m.name} seed={m.userId} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.name}</span>
                        <span className="block truncate text-[12px] text-muted">{m.email}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">{roleLabel(m.role)}</span>
                    </li>
                  ))}
                </ul>
              </section>

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
        </div>
      </div>
    </Modal>
  );
}
