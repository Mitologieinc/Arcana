import { useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { api } from "../lib/api";
import { Modal } from "./Modal";
import type { Member, MemberRole } from "../lib/types";

type PasskeyRow = {
  id: string;
  name?: string | null;
  aaguid?: string | null;
  createdAt?: Date | string | null;
  deviceType?: string;
};

export function SettingsPanel({
  members,
  role,
  onClose,
  onChanged,
}: {
  members: Member[];
  role: MemberRole;
  onClose: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const [tab, setTab] = useState<"team" | "security">("security");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [pkError, setPkError] = useState("");
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
            ["team", "チーム"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${
              tab === id ? "border-cf text-ink" : "border-transparent text-muted"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "security" && (
        <div>
          <p className="mb-4 text-[13px] leading-relaxed text-muted">
            パスキーは端末の生体認証やセキュリティキーでログインします。パスワードより安全です。
          </p>
          <button type="button" className="btn btn-primary mb-4" onClick={addPasskey}>
            <Fingerprint size={15} />
            パスキーを追加
          </button>
          {pkError && <p className="mb-3 text-[13px] text-danger">{pkError}</p>}
          <ul className="divide-y divide-line border border-line">
            {passkeys.length === 0 && (
              <li className="px-3 py-6 text-center text-[13px] text-muted">まだパスキーはありません</li>
            )}
            {passkeys.map((pk) => (
              <li key={pk.id} className="flex items-center justify-between px-3 py-2.5 text-[13px]">
                <span>
                  <span className="font-medium">
                    {pk.name || "Passkey"}
                  </span>
                  <span className="ml-2 text-muted">{pk.deviceType ?? ""}</span>
                </span>
                <button className="text-muted hover:text-danger" onClick={() => removePasskey(pk.id)} title="削除">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "team" && (
        <div>
          <p className="mb-4 text-[13px] text-muted">席の上限はありません。何人招待してもアプリ側の課金は増えません。</p>
          <ul className="mb-4 divide-y divide-line border border-line">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between px-3 py-2.5 text-[13px]">
                <span>
                  {m.name}
                  <span className="ml-2 text-muted">{m.email}</span>
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{m.role}</span>
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
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                  <option value="guest">guest</option>
                </select>
                <button className="btn btn-primary flex-1" onClick={invite}>
                  招待リンクを発行
                </button>
              </div>
              {inviteUrl && <p className="break-all text-[12px] text-cf">コピー済み: {inviteUrl}</p>}
              {error && <p className="text-[13px] text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
