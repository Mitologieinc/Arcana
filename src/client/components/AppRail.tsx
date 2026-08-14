import { Bell, Files, Home, PanelLeft, Plus, Search, Trash2 } from "lucide-react";
import { BrandMark } from "./Brand";
import { Avatar } from "./Avatar";
import type { User } from "../lib/types";

type Props = {
  user: User;
  home: boolean;
  navOpen: boolean;
  unread?: number;
  onHome: () => void;
  onSearch: () => void;
  onToggleNav: () => void;
  onNewPage: () => void;
  onSettings: () => void;
  onTrash: () => void;
  onNotifs: () => void;
};

export function AppRail({
  user,
  home,
  navOpen,
  unread = 0,
  onHome,
  onSearch,
  onToggleNav,
  onNewPage,
  onSettings,
  onTrash,
  onNotifs,
}: Props) {
  return (
    <nav className="arcana-rail" aria-label="メイン">
      <button className="mb-2 flex h-10 w-10 items-center justify-center" onClick={onHome} title="Arcana WorkSquare">
        <BrandMark className="h-7 w-11" hoverAnimate />
      </button>
      <button className="arcana-rail-btn" onClick={onSearch} title="検索">
        <Search size={18} strokeWidth={1.6} />
      </button>
      <button className={`arcana-rail-btn ${home ? "is-active" : ""}`} onClick={onHome} title="ホーム">
        <Home size={18} strokeWidth={1.6} />
      </button>
      <button className={`arcana-rail-btn ${navOpen ? "is-active" : ""}`} onClick={onToggleNav} title="ページ">
        <Files size={18} strokeWidth={1.6} />
      </button>
      <button className="arcana-rail-btn" onClick={onNewPage} title="新規ページ">
        <Plus size={18} strokeWidth={1.6} />
      </button>
      <div className="flex-1" />
      <button className="arcana-rail-btn relative" onClick={onNotifs} title="通知">
        <Bell size={18} strokeWidth={1.6} />
        {unread > 0 && <span className="arcana-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <button className="arcana-rail-btn" onClick={onTrash} title="ゴミ箱">
        <Trash2 size={18} strokeWidth={1.6} />
      </button>
      <button className="arcana-rail-btn" onClick={onSettings} title={user.name}>
        <Avatar name={user.name} seed={user.id} size={22} />
      </button>
      <button className="arcana-rail-btn" onClick={onToggleNav} title={navOpen ? "サイドバーを閉じる" : "サイドバーを開く"}>
        <PanelLeft size={18} strokeWidth={1.6} />
      </button>
    </nav>
  );
}
