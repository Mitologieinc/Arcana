import { useEffect, useState } from "react";
import { Bell, PanelLeft, Plus, Search, Settings, Trash2 } from "lucide-react";
import { BrandMark } from "./Brand";
import { Avatar } from "./Avatar";
import { CreateMenuPanel, type CreateSeed } from "./CreateMenu";
import type { SavedTemplate, User } from "../lib/types";

type Props = {
  user: User;
  home: boolean;
  navOpen: boolean;
  unread?: number;
  templates?: SavedTemplate[];
  onHome: () => void;
  onSearch: () => void;
  onToggleNav: () => void;
  onCreate: (seed: CreateSeed) => void;
  onSettings: () => void;
  onTrash: () => void;
  onNotifs: () => void;
};

export function AppRail({
  user,
  home,
  navOpen,
  unread = 0,
  templates = [],
  onHome,
  onSearch,
  onToggleNav,
  onCreate,
  onSettings,
  onTrash,
  onNotifs,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!menu && !createOpen) return;
    const close = () => {
      setMenu(false);
      setCreateOpen(false);
    };
    const t = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
    };
  }, [menu, createOpen]);

  return (
    <nav className="arcana-rail" aria-label="メイン">
      <button
        className={`arcana-rail-home mb-2 flex h-10 w-10 items-center justify-center overflow-hidden rounded ${home ? "bg-hover" : ""}`}
        onClick={onHome}
        title="ホーム"
      >
        <BrandMark className="h-7 w-auto" hoverAnimate />
      </button>
      <button className="arcana-rail-btn" onClick={onSearch} title="検索">
        <Search size={18} strokeWidth={1.6} />
      </button>
      <div className="relative">
        <button
          className={`arcana-rail-btn ${createOpen ? "is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(false);
            setCreateOpen((v) => !v);
          }}
          title="新規"
        >
          <Plus size={18} strokeWidth={1.6} />
        </button>
        {createOpen && (
          <div
            className="menu-panel absolute top-0 left-[calc(100%+8px)] z-30 w-56 max-[720px]:top-auto max-[720px]:bottom-[calc(100%+8px)] max-[720px]:left-1/2 max-[720px]:-translate-x-1/2"
            onClick={(e) => e.stopPropagation()}
          >
            <CreateMenuPanel
              templates={templates}
              onPick={(seed) => {
                setCreateOpen(false);
                onCreate(seed);
              }}
            />
          </div>
        )}
      </div>
      <div className="arcana-rail-grow flex-1" />
      <button className="arcana-rail-btn relative" onClick={onNotifs} title="通知">
        <Bell size={18} strokeWidth={1.6} />
        {unread > 0 && <span className="arcana-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <div className="relative">
        <button
          className="arcana-rail-btn"
          onClick={(e) => {
            e.stopPropagation();
            setCreateOpen(false);
            setMenu((v) => !v);
          }}
          title={user.name}
        >
          <Avatar name={user.name} seed={user.id} size={22} />
        </button>
        {menu && (
          <div
            className="menu-panel absolute bottom-0 left-[calc(100%+8px)] z-30 w-44 p-1 max-[720px]:bottom-[calc(100%+8px)] max-[720px]:left-auto max-[720px]:right-0"
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
        <button className="arcana-rail-btn max-[720px]:hidden" onClick={onToggleNav} title="サイドバーを開く">
          <PanelLeft size={18} strokeWidth={1.6} />
        </button>
      )}
    </nav>
  );
}
