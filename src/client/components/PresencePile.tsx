import { Avatar } from "./Avatar";

export type PresenceUser = {
  clientId: number;
  id: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
};

export function PresencePile({
  users,
  onOpen,
}: {
  users: PresenceUser[];
  onOpen?: (user: PresenceUser) => void;
}) {
  if (users.length === 0) return null;
  const shown = users.slice(0, 5);
  const extra = users.length - shown.length;
  return (
    <div
      className="flex items-center pr-1"
      title={users.map((u) => u.name).join("、")}
    >
      {shown.map((u, i) => (
        <button
          key={u.clientId}
          type="button"
          className="arcana-presence"
          style={{ zIndex: shown.length - i, marginLeft: i === 0 ? 0 : -6 }}
          title={`${u.name}の位置へ`}
          onClick={() => onOpen?.(u)}
        >
          <Avatar name={u.name} seed={u.id} size={22} />
        </button>
      ))}
      {extra > 0 && <span className="ml-1.5 text-[11px] text-muted">+{extra}</span>}
    </div>
  );
}
