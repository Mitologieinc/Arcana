import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  getTextFromElements,
  ROUNDNESS,
  viewportCoordsToSceneCoords,
  WelcomeScreen,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { api } from "../lib/api";
import { uploadFile } from "../editor/slash";
import type { User } from "../lib/types";
import type { PresenceUser } from "./PresencePile";

const ORIGIN = "arcana-canvas";
const STICKIES = [
  { color: "#ffec99", label: "黄" },
  { color: "#ffc9c9", label: "赤" },
  { color: "#b2f2bb", label: "緑" },
  { color: "#a5d8ff", label: "青" },
];

const COLORS = ["#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#196a63"];

function colorFor(id: string) {
  let n = 0;
  for (const ch of id) n += ch.charCodeAt(0);
  return COLORS[n % COLORS.length];
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type SceneElements = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0];
type SceneElement = SceneElements[number];
type StoredEl = SceneElement & { versionNonce?: number };

export function CanvasEditor({
  pageId,
  user,
  shareToken,
  editable,
  title,
  onPresence,
}: {
  pageId: string;
  user: User;
  shareToken?: string;
  editable: boolean;
  title: string;
  onPresence?: (users: PresenceUser[]) => void;
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const applyingRef = useRef(false);
  const indexTimer = useRef<number | null>(null);
  const uploaded = useRef(new Map<string, string>());
  const [synced, setSynced] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  const collab = useMemo(() => {
    const doc = new Y.Doc();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params: Record<string, string> = {};
    if (shareToken) params.token = shareToken;
    const provider = new WebsocketProvider(`${proto}//${location.host}/api/collab`, pageId, doc, {
      params,
    });
    return {
      doc,
      provider,
      elements: doc.getMap<StoredEl>("canvas.elements"),
      order: doc.getArray<string>("canvas.order"),
      files: doc.getMap<BinaryFileData>("canvas.files"),
    };
  }, [pageId, shareToken]);

  useEffect(() => {
    return () => {
      collab.provider.destroy();
      collab.doc.destroy();
    };
  }, [collab]);

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setTheme(el.dataset.theme === "dark" ? "dark" : "light");
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const awareness = collab.provider.awareness;
    awareness.setLocalStateField("user", {
      name: user.name || "ゲスト",
      color: colorFor(user.id),
      id: user.id,
    });
    const report = () => {
      if (!onPresence) return;
      const others: PresenceUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const raw = state.user as { name?: string; color?: string; id?: string } | undefined;
        if (!raw?.name) return;
        others.push({
          clientId,
          id: raw.id || String(clientId),
          name: raw.name,
          color: raw.color || "#37352f",
        });
      });
      onPresence(others);
    };
    awareness.on("change", report);
    collab.provider.on("status", report);
    report();
    return () => {
      awareness.off("change", report);
      collab.provider.off("status", report);
    };
  }, [collab, user, onPresence]);

  useEffect(() => {
    const onSync = (ok: boolean) => {
      if (ok) setSynced(true);
    };
    if (collab.provider.synced) setSynced(true);
    collab.provider.on("sync", onSync);
    return () => {
      collab.provider.off("sync", onSync);
    };
  }, [collab]);

  function pullElements(): SceneElement[] {
    const order = collab.order.toArray();
    const seen = new Set<string>();
    const out: SceneElement[] = [];
    for (const id of order) {
      const el = collab.elements.get(id);
      if (!el) continue;
      out.push(el);
      seen.add(id);
    }
    collab.elements.forEach((el, id) => {
      if (!seen.has(id)) out.push(el);
    });
    return out;
  }

  function pullFiles(): BinaryFiles {
    const files: BinaryFiles = {};
    collab.files.forEach((file, id) => {
      files[id as BinaryFileData["id"]] = file;
    });
    return files;
  }

  function pushScene(elements: SceneElements, files: BinaryFiles) {
    collab.doc.transact(() => {
      const ids: string[] = [];
      for (const el of elements) {
        ids.push(el.id);
        const prev = collab.elements.get(el.id);
        if (!prev || prev.versionNonce !== el.versionNonce) {
          collab.elements.set(el.id, clone(el));
        }
      }
      for (const key of [...collab.elements.keys()]) {
        if (!ids.includes(key)) collab.elements.delete(key);
      }
      const prevOrder = collab.order.toArray();
      if (prevOrder.length !== ids.length || prevOrder.some((id, i) => id !== ids[i])) {
        if (collab.order.length) collab.order.delete(0, collab.order.length);
        if (ids.length) collab.order.push(ids);
      }

      const fileIds = new Set(Object.keys(files));
      for (const [id, file] of Object.entries(files)) {
        const stored = uploaded.current.get(id);
        const next = clone({
          ...file,
          dataURL: (stored || file.dataURL) as BinaryFileData["dataURL"],
        });
        const prev = collab.files.get(id);
        if (!prev || prev.dataURL !== next.dataURL) collab.files.set(id, next);
      }
      for (const key of [...collab.files.keys()]) {
        if (!fileIds.has(key)) collab.files.delete(key);
      }
    }, ORIGIN);
  }

  function applyRemote() {
    const api = apiRef.current;
    if (!api) return;
    applyingRef.current = true;
    try {
      const files = Object.values(pullFiles());
      if (files.length) api.addFiles(files);
      api.updateScene({
        elements: pullElements(),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    } finally {
      applyingRef.current = false;
    }
  }

  useEffect(() => {
    const onEls = (_: unknown, txn: Y.Transaction) => {
      if (txn.origin === ORIGIN) return;
      applyRemote();
    };
    collab.elements.observe(onEls);
    collab.order.observe(onEls);
    collab.files.observe(onEls);
    return () => {
      collab.elements.unobserve(onEls);
      collab.order.unobserve(onEls);
      collab.files.unobserve(onEls);
    };
  }, [collab]);

  useEffect(() => {
    const awareness = collab.provider.awareness;
    const syncCollabs = () => {
      const api = apiRef.current;
      if (!api) return;
      const next = new Map<SocketId, { username: string; color: { background: string; stroke: string }; pointer?: { x: number; y: number; tool: "pointer" | "laser" }; button?: "up" | "down" }>();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const raw = state.user as { name?: string; color?: string } | undefined;
        if (!raw?.name) return;
        const pointer = state.pointer as { x: number; y: number; tool: "pointer" | "laser" } | undefined;
        const button = state.button as "up" | "down" | undefined;
        next.set(String(clientId) as SocketId, {
          username: raw.name,
          color: { background: raw.color || "#37352f", stroke: raw.color || "#37352f" },
          pointer,
          button,
        });
      });
      api.updateScene({ collaborators: next });
    };
    awareness.on("change", syncCollabs);
    return () => awareness.off("change", syncCollabs);
  }, [collab]);

  function addSticky(color: string) {
    const api = apiRef.current;
    if (!api || !editable) return;
    const appState = api.getAppState();
    const center = viewportCoordsToSceneCoords(
      { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 },
      appState,
    );
    const created = convertToExcalidrawElements(
      [
        {
          type: "rectangle",
          x: center.x - 88,
          y: center.y - 88,
          width: 176,
          height: 176,
          backgroundColor: color,
          strokeColor: "transparent",
          fillStyle: "solid",
          roughness: 0,
          roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
          label: { text: " " },
        },
      ],
      { regenerateIds: true },
    );
    const selected: Record<string, true> = {};
    for (const el of created) selected[el.id] = true;
    api.updateScene({
      elements: [...api.getSceneElements(), ...created],
      appState: { selectedElementIds: selected },
    });
  }

  if (!synced) {
    return <div className="flex h-full items-center justify-center text-[13px] text-muted">読み込み中…</div>;
  }

  return (
    <div className="arcana-canvas relative h-full min-h-0">
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        langCode="ja-JP"
        theme={theme}
        name={title || "キャンバス"}
        viewModeEnabled={!editable}
        isCollaborating
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
        initialData={{
          elements: pullElements(),
          files: pullFiles(),
          appState: {
            viewBackgroundColor: theme === "dark" ? "#191919" : "#f7f6f3",
            currentItemRoughness: 0,
          },
        }}
        generateIdForFile={async (file) => {
          const out = await uploadFile(file);
          const id = out.src.split("/").pop() ?? crypto.randomUUID();
          uploaded.current.set(id, out.src);
          return id;
        }}
        onPointerUpdate={({ pointer, button }) => {
          collab.provider.awareness.setLocalStateField("pointer", pointer);
          collab.provider.awareness.setLocalStateField("button", button);
        }}
        onChange={(elements, _appState, files) => {
          if (applyingRef.current || !editable) return;
          pushScene(elements, files);
          if (indexTimer.current) window.clearTimeout(indexTimer.current);
          indexTimer.current = window.setTimeout(() => {
            void api(`/api/pages/${pageId}/index`, {
              method: "POST",
              body: JSON.stringify({ title, bodyText: getTextFromElements(elements) }),
            });
          }, 1500);
        }}
      >
        <WelcomeScreen>
          <WelcomeScreen.Hints.ToolbarHint>
            図形・矢印・手書きは左のツールから
          </WelcomeScreen.Hints.ToolbarHint>
          <WelcomeScreen.Hints.HelpHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>キャンバス</WelcomeScreen.Center.Heading>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </Excalidraw>
      {editable && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-white p-1 shadow-sm dark-stickies">
            <span className="px-2 text-[11px] text-muted">付箋</span>
            {STICKIES.map((s) => (
              <button
                key={s.color}
                type="button"
                title={`${s.label}の付箋`}
                className="h-7 w-7 rounded-[6px] border border-black/5"
                style={{ background: s.color }}
                onClick={() => addSticky(s.color)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
