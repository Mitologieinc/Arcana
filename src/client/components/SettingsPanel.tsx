import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { roleLabel } from "../lib/format";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import type { Member, MemberRole, Workspace } from "../lib/types";

type PasskeyRow = {
  id: string;
  name?: string | null;
  aaguid?: string | null;
  createdAt?: Date | string | null;
  deviceType?: string;
};

export function SettingsPanel({
  members,
  workspace,
  role,
  onClose,
  onChanged,
  onSignOut,
}: {
  members: Member[];
  workspace: Workspace;
  role: MemberRole;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
  onSignOut: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"team" | "security" | "appearance">("security");
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [pkError, setPkError] = useState("");
  const [inviteOnly, setInviteOnly] = useState(Boolean(workspace.inviteOnly));
  const [allowedDomains, setAllowedDomains] = useState(workspace.allowedDomains ?? "");
  const [mailFrom, setMailFrom] = useState(workspace.mailFrom ?? "");
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

  return (
    <Modal title="設定" onClose={onClose} wide>
      <div className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ["security", "セキュリティ"],
            ["appearance", "表示"],
            ["team", "チーム"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${
              tab === id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "security" && (
        <div>
          <p className="mb-4 text-[13px] leading-relaxed text-muted">パスキーでログインできます。</p>
          <button type="button" className="btn btn-secondary mb-4" onClick={addPasskey}>
            <Fingerprint size={15} />
            パスキーを追加
          </button>
          {pkError && <p className="mb-3 text-[13px] text-danger">{pkError}</p>}
          <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line">
            {passkeys.length === 0 && (
              <li className="px-3 py-8 text-center text-[13px] text-muted">まだパスキーはありません</li>
            )}
            {passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between px-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">{pk.name || "Passkey"}</span>
                  <span className="ml-2 text-muted">{pk.deviceType ?? ""}</span>
                </span>
                <button className="rounded-md p-1 text-muted hover:bg-hover hover:text-danger" onClick={() => removePasskey(pk.id)} title="削除">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "appearance" && (
        <div>
          <p className="mb-3 text-[13px] text-muted">画面の明るさ</p>
          <div className="flex gap-2">
            {(
              [
                ["light", "ライト"],
                ["dark", "ダーク"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`btn btn-secondary ${theme === id ? "ring-1 ring-ink" : ""}`}
                onClick={() => {
                  document.documentElement.dataset.theme = id;
                  localStorage.setItem("arcana.theme", id);
                  setTheme(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "team" && (
        <div>
          {canInvite && (
            <div className="mb-6 space-y-3">
              <p className="text-[13px] font-medium">参加</p>
              <div className="grid gap-2">
                {(
                  [
                    [false, "この URL を知っていれば参加できる"],
                    [true, "招待リンクがある人だけ"],
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
              <label className="field">
                <span>許可するメールドメイン（任意）</span>
                <input
                  value={allowedDomains}
                  placeholder="example.com, company.co.jp"
                  onChange={(e) => setAllowedDomains(e.target.value)}
                />
              </label>
              <p className="text-[12px] text-muted">カンマ区切り。空ならドメインは制限しません。ゲスト招待は対象外です。</p>
              <label className="field">
                <span>確認メールの送信元</span>
                <input
                  value={mailFrom}
                  placeholder="noreply@example.com"
                  onChange={(e) => setMailFrom(e.target.value)}
                />
              </label>
              <p className="text-[12px] text-muted">
                入れると新規登録で確認コードを送ります。この Cloudflare アカウントの Email Sending に載せたドメインのアドレスにしてください。空なら確認はしません。
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  setAccessError("");
                  setAccessSaved("");
                  try {
                    await api("/api/workspace", {
                      method: "PATCH",
                      body: JSON.stringify({ inviteOnly, allowedDomains, mailFrom }),
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
            </div>
          )}
          <p className="mb-4 text-[13px] text-muted">人数に上限はありません。</p>
          <ul className="mb-4 divide-y divide-line overflow-hidden rounded-[10px] border border-line">
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
          {canInvite && (
            <div className="space-y-2">
              <input
                className="input"
                placeholder="招待するメール"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="input w-auto"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                >
                  <option value="member">メンバー</option>
                  <option value="admin">管理者</option>
                  <option value="guest">ゲスト</option>
                </select>
                <button className="btn btn-secondary flex-1" onClick={invite}>
                  招待リンクを発行
                </button>
              </div>
              {inviteUrl && <p className="break-all text-[12px] text-cf">コピー済み: {inviteUrl}</p>}
              {error && <p className="text-[13px] text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}

      <button type="button" className="mt-6 text-[13px] text-muted hover:text-ink" onClick={() => void onSignOut()}>
        ログアウト
      </button>
    </Modal>
  );
}
