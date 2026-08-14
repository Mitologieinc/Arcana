import { useEffect, useState } from "react";
import { Bell, PanelLeft, Plus, Search, Settings, Trash2 } from "lucide-react";
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
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const t = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [menu]);

  return (
    <nav className="arcana-rail" aria-label="メイン">
      <button
        className={`mb-2 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] ${home ? "bg-hover" : ""}`}
        onClick={onHome}
        title="ホーム"
      >
        <BrandMark className="h-7 w-auto" hoverAnimate />
      </button>
      <button className="arcana-rail-btn" onClick={onSearch} title="検索">
        <Search size={18} strokeWidth={1.6} />
      </button>
      <button className="arcana-rail-btn" onClick={onNewPage} title="新規ページ">
        <Plus size={18} strokeWidth={1.6} />
      </button>
      <div className="flex-1" />
      <button className="arcana-rail-btn relative" onClick={onNotifs} title="通知">
        <Bell size={18} strokeWidth={1.6} />
        {unread > 0 && <span className="arcana-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <div className="relative">
        <button
          className="arcana-rail-btn"
          onClick={(e) => {
            e.stopPropagation();
            setMenu((v) => !v);
          }}
          title={user.name}
        >
          <Avatar name={user.name} seed={user.id} size={22} />
        </button>
        {menu && (
          <div
            className="menu-panel absolute bottom-0 left-[calc(100%+8px)] z-30 w-44 p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
              onClick={() => {
                setMenu(false);
                onSettings();
              }}
            >
              <Settings size={14} />
              設定
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-hover"
              onClick={() => {
                setMenu(false);
                onTrash();
              }}
            >
              <Trash2 size={14} />
              ゴミ箱
            </button>
          </div>
        )}
      </div>
      {!navOpen && (
        <button className="arcana-rail-btn" onClick={onToggleNav} title="サイドバーを開く">
          <PanelLeft size={18} strokeWidth={1.6} />
        </button>
      )}
    </nav>
  );
}
