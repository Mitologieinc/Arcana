import { Files, Home, PanelLeft, Plus, Search } from "lucide-react";
import { BrandMark } from "./Brand";
import { Avatar } from "./Avatar";
import type { User } from "../lib/types";

type Props = {
  user: User;
  home: boolean;
  navOpen: boolean;
  onHome: () => void;
  onSearch: () => void;
  onToggleNav: () => void;
  onNewPage: () => void;
  onSettings: () => void;
};

export function AppRail({
  user,
  home,
  navOpen,
  onHome,
  onSearch,
  onToggleNav,
  onNewPage,
  onSettings,
}: Props) {
  return (
    <nav className="arcana-rail" aria-label="メイン">
      <button className="mb-2 flex h-10 w-10 items-center justify-center" onClick={onHome} title="Arcana WorkSquare">
        <BrandMark className="h-7 w-7" />
      </button>
      <button className="arcana-rail-btn" onClick={onSearch} title="検索">
        <Search size={18} strokeWidth={1.6} />
      </button>
      <button className={`arcana-rail-btn ${home ? "is-active" : ""}`} onClick={onHome} title="ホーム">
        <Home size={18} strokeWidth={1.6} />
      </button>
      <button
        className={`arcana-rail-btn ${navOpen ? "is-active" : ""}`}
        onClick={onToggleNav}
        title="ページ"
      >
        <Files size={18} strokeWidth={1.6} />
      </button>
      <button className="arcana-rail-btn" onClick={onNewPage} title="新規ページ">
        <Plus size={18} strokeWidth={1.6} />
      </button>
      <div className="flex-1" />
      <button className="arcana-rail-btn" onClick={onSettings} title={user.name}>
        <Avatar name={user.name} seed={user.id} size={22} />
      </button>
      <button className="arcana-rail-btn" onClick={onToggleNav} title={navOpen ? "サイドバーを閉じる" : "サイドバーを開く"}>
        <PanelLeft size={18} strokeWidth={1.6} />
      </button>
    </nav>
  );
}
