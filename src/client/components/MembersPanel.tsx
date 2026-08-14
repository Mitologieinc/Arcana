import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../lib/api";
import type { Member, MemberRole } from "../lib/types";

export function MembersPanel({
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
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const canInvite = role === "owner" || role === "admin";

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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">メンバー</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          席の上限はありません。何人招待してもアプリ側の課金は増えません。
        </p>
        <ul className="mb-4 max-h-48 overflow-auto text-sm">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between border-b border-line py-2">
              <span>
                {m.name}
                <span className="ml-2 text-xs text-muted">{m.email}</span>
              </span>
              <span className="text-xs text-muted">{m.role}</span>
            </li>
          ))}
        </ul>
        {canInvite && (
          <div className="space-y-2">
            <input
              className="w-full rounded border border-line px-2 py-1.5 text-sm"
              placeholder="招待するメール"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                className="rounded border border-line px-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
                <option value="guest">guest</option>
              </select>
              <button className="flex-1 rounded-md bg-ink py-1.5 text-sm text-white" onClick={invite}>
                招待リンクを発行
              </button>
            </div>
            {inviteUrl && <p className="break-all text-xs text-accent">コピー済み: {inviteUrl}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
