import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  Circle,
  Diamond,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Spline,
  Square,
  StickyNote,
  Type,
} from "lucide-react";
import { api } from "../lib/api";
import type { User } from "../lib/types";
import type { PresenceUser } from "./PresencePile";

const ORIGIN = "arcana-jam";
const STICKY = 240;
const STICKY_COLORS = ["#FFE299", "#FFD3A8", "#FFB8A8", "#FFA8DB", "#D3BDFF", "#A8DAFF", "#B3F4EF", "#B3EFBD", "#E6E6E6", "#FFFFFF"];
const INK = "#1e1e1e";
const LINE = "#b3b3b3";
const SHAPE_STROKE = "#b3b3b3";
const COLORS = ["#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#196a63"];

type Tool = "select" | "hand" | "sticky" | "shape" | "text" | "line" | "pen";
type ShapeKind = "round" | "ellipse" | "diamond";
type JamNode = {
  id: string;
  kind: "sticky" | "shape" | "text" | "pen" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string;
  stroke: string;
  variant?: ShapeKind;
  points?: { x: number; y: number }[];
  fromId?: string;
  toId?: string;
  fontSize?: number;
};

function colorFor(id: string) {
  let n = 0;
  for (const ch of id) n += ch.charCodeAt(0);
  return COLORS[n % COLORS.length];
}

function nid() {
  return crypto.randomUUID();
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isJam(n: unknown): n is JamNode {
  if (!n || typeof n !== "object") return false;
  const k = (n as JamNode).kind;
  return k === "sticky" || k === "shape" || k === "text" || k === "pen" || k === "line";
}

function hit(n: JamNode, x: number, y: number) {
  if (n.kind === "line" || n.kind === "pen") return false;
  return x >= n.x && y >= n.y && x <= n.x + n.w && y <= n.y + n.h;
}

function center(n: JamNode) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

function edgeToward(n: JamNode, tx: number, ty: number) {
  const c = center(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = n.w / 2;
  const hh = n.h / 2;
  const sx = Math.abs(dx) < 0.001 ? 1e9 : hw / Math.abs(dx);
  const sy = Math.abs(dy) < 0.001 ? 1e9 : hh / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

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
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | {
    mode: "pan" | "move" | "pen" | "marquee" | "line" | "shape";
    x: number;
    y: number;
    cx: number;
    cy: number;
    sx: number;
    sy: number;
    id?: string;
    ids?: string[];
    origin?: Record<string, { x: number; y: number }>;
  }>(null);
  const moveRaf = useRef<number | null>(null);
  const pendingMove = useRef<null | { ids: string[]; origin: Record<string, { x: number; y: number }>; dx: number; dy: number }>(null);
  const indexTimer = useRef<number | null>(null);
  const [nodes, setNodes] = useState<JamNode[]>([]);
  const [cam, setCam] = useState({ x: 48, y: 48, z: 1 });
  const [tool, setTool] = useState<Tool>("select");
  const [stickyColor, setStickyColor] = useState(STICKY_COLORS[0]);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("round");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const [cursors, setCursors] = useState<{ id: string; name: string; color: string; x: number; y: number }[]>([]);
  const [lineFrom, setLineFrom] = useState<string | null>(null);
  const [lineHover, setLineHover] = useState<{ x: number; y: number } | null>(null);
  const [ghost, setGhost] = useState<null | { kind: "sticky" | "shape" | "text"; x: number; y: number; w: number; h: number }>(null);
  const [marquee, setMarquee] = useState<null | { x: number; y: number; w: number; h: number }>(null);

  const collab = useMemo(() => {
    const doc = new Y.Doc();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params: Record<string, string> = {};
    if (shareToken) params.token = shareToken;
    const provider = new WebsocketProvider(`${proto}//${location.host}/api/collab`, pageId, doc, { params });
    const map = doc.getMap<JamNode>("jam.nodes");
    const order = doc.getArray<string>("jam.order");
    const undo = new Y.UndoManager([map, order]);
    return { doc, provider, map, order, undo };
  }, [pageId, shareToken]);

  function pull(): JamNode[] {
    const seen = new Set<string>();
    const out: JamNode[] = [];
    for (const id of collab.order.toArray()) {
      const n = collab.map.get(id);
      if (!isJam(n) || seen.has(id)) continue;
      out.push(n);
      seen.add(id);
    }
    collab.map.forEach((n, id) => {
      if (!isJam(n) || seen.has(id)) return;
      out.push(n);
    });
    return out;
  }

  function refresh() {
    setNodes(pull());
  }

  function put(n: JamNode, atEnd = true) {
    collab.doc.transact(() => {
      collab.map.set(n.id, clone(n));
      const ids = collab.order.toArray();
      if (!ids.includes(n.id) && atEnd) collab.order.push([n.id]);
    }, ORIGIN);
    refresh();
  }

  function patch(id: string, partial: Partial<JamNode>) {
    const cur = collab.map.get(id);
    if (!isJam(cur)) return;
    collab.doc.transact(() => {
      collab.map.set(id, clone({ ...cur, ...partial }));
    }, ORIGIN);
    refresh();
  }

  function removeIds(ids: string[]) {
    const drop = new Set(ids);
    collab.doc.transact(() => {
      for (const id of ids) collab.map.delete(id);
      const next = collab.order.toArray().filter((id) => !drop.has(id));
      if (collab.order.length) collab.order.delete(0, collab.order.length);
      if (next.length) collab.order.push(next);
      collab.map.forEach((n, id) => {
        if (isJam(n) && n.kind === "line" && (drop.has(n.fromId ?? "") || drop.has(n.toId ?? ""))) {
          collab.map.delete(id);
        }
      });
    }, ORIGIN);
    setSelected([]);
    setEditing(null);
    refresh();
  }

  useEffect(() => {
    return () => {
      collab.provider.destroy();
      collab.doc.destroy();
    };
  }, [collab]);

  useEffect(() => {
    const on = (_: unknown, txn: Y.Transaction) => {
      if (txn.origin === ORIGIN) return;
      refresh();
    };
    collab.map.observe(on);
    collab.order.observe(on);
    refresh();
    return () => {
      collab.map.unobserve(on);
      collab.order.unobserve(on);
    };
  }, [collab]);

  useEffect(() => {
    const awareness = collab.provider.awareness;
    awareness.setLocalStateField("user", { name: user.name || "ゲスト", color: colorFor(user.id), id: user.id });
    const report = () => {
      const others: PresenceUser[] = [];
      const next: { id: string; name: string; color: string; x: number; y: number }[] = [];
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
        const p = state.jam as { x?: number; y?: number } | undefined;
        if (typeof p?.x === "number" && typeof p.y === "number") {
          next.push({ id: String(clientId), name: raw.name, color: raw.color || "#37352f", x: p.x, y: p.y });
        }
      });
      onPresence?.(others);
      setCursors(next);
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
    if (indexTimer.current) window.clearTimeout(indexTimer.current);
    indexTimer.current = window.setTimeout(() => {
      const bodyText = pull()
        .map((n) => n.text)
        .filter(Boolean)
        .join(" ");
      void api(`/api/pages/${pageId}/index`, { method: "POST", body: JSON.stringify({ title, bodyText }) });
    }, 1500);
  }, [nodes, pageId, title]);

  function worldFromClient(clientX: number, clientY: number) {
    const r = boardRef.current?.getBoundingClientRect();
    return {
      x: (clientX - (r?.left ?? 0) - cam.x) / cam.z,
      y: (clientY - (r?.top ?? 0) - cam.y) / cam.z,
    };
  }

  const activeTool: Tool = space || tool === "hand" ? "hand" : !editable ? "select" : tool;

  function topAt(x: number, y: number) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (hit(nodes[i], x, y)) return nodes[i];
    }
    return null;
  }

  function startEdit(id: string) {
    if (!editable) return;
    setEditing(id);
    setSelected([id]);
    requestAnimationFrame(() => {
      boardRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-id="${id}"]`)?.focus();
    });
  }

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        setCam((c) => {
          const z = Math.min(3.5, Math.max(0.2, c.z * (e.deltaY > 0 ? 0.92 : 1.08)));
          const wx = (sx - c.x) / c.z;
          const wy = (sy - c.y) / c.z;
          return { z, x: sx - wx * z, y: sy - wy * z };
        });
        return;
      }
      setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function overUi(t: EventTarget | null) {
    return t instanceof Element && Boolean(t.closest(".jam-bar, .jam-zoom, .jam-title"));
  }

  function ghostAt(tool: Tool, w: { x: number; y: number }) {
    if (tool === "sticky") return { kind: "sticky" as const, x: w.x - STICKY / 2, y: w.y - STICKY / 2, w: STICKY, h: STICKY };
    if (tool === "shape") return { kind: "shape" as const, x: w.x - 80, y: w.y - 80, w: 160, h: 160 };
    if (tool === "text") return { kind: "text" as const, x: w.x, y: w.y - 16, w: 280, h: 48 };
    return null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (overUi(e.target)) return;
    if (e.button === 1 || activeTool === "hand") {
      drag.current = { mode: "pan", x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      setGhost(null);
      return;
    }
    const w = worldFromClient(e.clientX, e.clientY);
    collab.provider.awareness.setLocalStateField("jam", w);
    if (!editable) return;
    if (editing && (e.target as HTMLElement).tagName !== "TEXTAREA") setEditing(null);

    if (activeTool === "sticky") {
      const g = ghostAt("sticky", w)!;
      const n: JamNode = {
        id: nid(),
        kind: "sticky",
        x: g.x,
        y: g.y,
        w: g.w,
        h: g.h,
        text: "",
        fill: stickyColor,
        stroke: "transparent",
        fontSize: 18,
      };
      put(n);
      startEdit(n.id);
      return;
    }
    if (activeTool === "shape") {
      const n: JamNode = {
        id: nid(),
        kind: "shape",
        x: w.x,
        y: w.y,
        w: 1,
        h: 1,
        text: "",
        fill: "#ffffff",
        stroke: SHAPE_STROKE,
        variant: shapeKind,
        fontSize: 16,
      };
      put(n);
      setSelected([n.id]);
      setGhost(null);
      drag.current = { mode: "shape", x: w.x, y: w.y, cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY, id: n.id };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === "text") {
      const g = ghostAt("text", w)!;
      const n: JamNode = {
        id: nid(),
        kind: "text",
        x: g.x,
        y: g.y,
        w: g.w,
        h: g.h,
        text: "",
        fill: "transparent",
        stroke: "transparent",
        fontSize: 28,
      };
      put(n);
      startEdit(n.id);
      return;
    }
    if (activeTool === "pen") {
      const n: JamNode = {
        id: nid(),
        kind: "pen",
        x: w.x,
        y: w.y,
        w: 1,
        h: 1,
        text: "",
        fill: "transparent",
        stroke: INK,
        points: [{ x: w.x, y: w.y }],
      };
      put(n);
      drag.current = { mode: "pen", x: w.x, y: w.y, cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY, id: n.id };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === "line") {
      const t = topAt(w.x, w.y);
      if (!t || t.kind === "pen" || t.kind === "line") return;
      setLineFrom(t.id);
      setLineHover(w);
      setSelected([t.id]);
      drag.current = { mode: "line", x: w.x, y: w.y, cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY, id: t.id };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const t = topAt(w.x, w.y);
    if (t) {
      const ids = e.shiftKey || selected.includes(t.id) ? Array.from(new Set([...selected, t.id])) : [t.id];
      setSelected(ids);
      if (e.detail === 2 && (t.kind === "sticky" || t.kind === "text" || t.kind === "shape")) {
        startEdit(t.id);
        return;
      }
      const origin: Record<string, { x: number; y: number }> = {};
      for (const id of ids) {
        const n = nodes.find((x) => x.id === id);
        if (n) origin[id] = { x: n.x, y: n.y };
      }
      drag.current = { mode: "move", x: w.x, y: w.y, cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY, ids, origin };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    setSelected([]);
    setLineFrom(null);
    drag.current = { mode: "marquee", x: w.x, y: w.y, cx: cam.x, cy: cam.y, sx: e.clientX, sy: e.clientY };
    setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const w = worldFromClient(e.clientX, e.clientY);
    collab.provider.awareness.setLocalStateField("jam", w);
    const d = drag.current;
    if (!d && editable && !overUi(e.target)) {
      setGhost(ghostAt(activeTool, w));
    } else if (!d) {
      setGhost(null);
    }
    if (!d) return;
    if (d.mode === "pan") {
      setCam({ ...cam, x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y) });
      return;
    }
    if (d.mode === "move" && d.ids && d.origin) {
      pendingMove.current = { ids: d.ids, origin: d.origin, dx: w.x - d.x, dy: w.y - d.y };
      if (moveRaf.current == null) {
        moveRaf.current = requestAnimationFrame(() => {
          moveRaf.current = null;
          const p = pendingMove.current;
          if (!p) return;
          for (const id of p.ids) {
            const o = p.origin[id];
            if (o) patch(id, { x: o.x + p.dx, y: o.y + p.dy });
          }
        });
      }
      return;
    }
    if (d.mode === "shape" && d.id) {
      const x = Math.min(d.x, w.x);
      const y = Math.min(d.y, w.y);
      patch(d.id, { x, y, w: Math.max(1, Math.abs(w.x - d.x)), h: Math.max(1, Math.abs(w.y - d.y)) });
      return;
    }
    if (d.mode === "line") {
      setLineHover(w);
      return;
    }
    if (d.mode === "pen" && d.id) {
      const cur = collab.map.get(d.id);
      if (!isJam(cur) || !cur.points) return;
      const last = cur.points[cur.points.length - 1];
      if (last && Math.hypot(w.x - last.x, w.y - last.y) < 2) return;
      patch(d.id, { points: [...cur.points, { x: w.x, y: w.y }] });
      return;
    }
    if (d.mode === "marquee") {
      const x = Math.min(d.x, w.x);
      const y = Math.min(d.y, w.y);
      setMarquee({ x, y, w: Math.abs(w.x - d.x), h: Math.abs(w.y - d.y) });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const w = worldFromClient(e.clientX, e.clientY);
    if (d?.mode === "marquee" && marquee) {
      const hits = nodes.filter((n) => n.kind !== "line" && n.kind !== "pen" && n.x < marquee.x + marquee.w && n.y < marquee.y + marquee.h && n.x + n.w > marquee.x && n.y + n.h > marquee.y).map((n) => n.id);
      setSelected(hits);
    }
    if (d?.mode === "shape" && d.id) {
      const cur = collab.map.get(d.id);
      if (isJam(cur) && (cur.w < 24 || cur.h < 24)) {
        patch(d.id, { x: d.x - 80, y: d.y - 80, w: 160, h: 160 });
      }
    }
    if (d?.mode === "line" && d.id) {
      const t = topAt(w.x, w.y);
      if (t && t.id !== d.id && t.kind !== "pen" && t.kind !== "line") {
        put({
          id: nid(),
          kind: "line",
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          text: "",
          fill: "transparent",
          stroke: LINE,
          fromId: d.id,
          toId: t.id,
        });
      }
      setSelected([]);
    }
    if (d?.mode === "move" && d.ids?.length === 1 && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) {
      const n = nodes.find((x) => x.id === d.ids![0]);
      if (n && (n.kind === "sticky" || n.kind === "text" || n.kind === "shape")) startEdit(n.id);
    }
    drag.current = null;
    setMarquee(null);
    setLineFrom(null);
    setLineHover(null);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === " " && !editing && !typing) {
        e.preventDefault();
        setSpace(true);
      }
      if (editing || typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) collab.undo.redo();
        else collab.undo.undo();
        refresh();
        return;
      }
      if (!editable) return;
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selected.length) {
          e.preventDefault();
          removeIds(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        setSelected([]);
        setLineFrom(null);
        setLineHover(null);
        setGhost(null);
        setTool("select");
      }
      const k = e.key.toLowerCase();
      if (k === "v") setTool("select");
      if (k === "h") setTool("hand");
      if (k === "s") setTool("sticky");
      if (k === "r") setTool("shape");
      if (k === "t") setTool("text");
      if (k === "l" || k === "x") setTool("line");
      if (k === "p") setTool("pen");
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [editing, editable, selected, collab]);

  function zoomBy(factor: number) {
    const el = boardRef.current;
    if (!el) {
      setCam((c) => ({ ...c, z: Math.min(3.5, Math.max(0.2, c.z * factor)) }));
      return;
    }
    const r = el.getBoundingClientRect();
    const sx = r.width / 2;
    const sy = r.height / 2;
    setCam((c) => {
      const z = Math.min(3.5, Math.max(0.2, c.z * factor));
      return { z, x: sx - ((sx - c.x) / c.z) * z, y: sy - ((sy - c.y) / c.z) * z };
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const empty = nodes.length === 0;
  const ghosting = activeTool === "sticky" || activeTool === "shape" || activeTool === "text";

  return (
    <div className={`jam ${activeTool === "hand" ? "is-hand" : ""} ${activeTool === "pen" || activeTool === "line" ? "is-pen" : ""} ${ghosting ? "is-place" : ""}`}>
      <div
        ref={boardRef}
        className="jam-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setGhost(null)}
      >
      <div
        className="jam-dots"
        style={{
          backgroundSize: `${24 * cam.z}px ${24 * cam.z}px`,
          backgroundPosition: `${cam.x}px ${cam.y}px`,
        }}
      />
      <div className="jam-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
        <svg className="jam-svg" aria-hidden>
          {nodes.map((n) => {
            if (n.kind === "pen" && n.points && n.points.length > 1) {
              return (
                <polyline
                  key={n.id}
                  fill="none"
                  stroke={n.stroke}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={n.points.map((p) => `${p.x},${p.y}`).join(" ")}
                />
              );
            }
            if (n.kind === "line") {
              const a = n.fromId ? byId.get(n.fromId) : null;
              const b = n.toId ? byId.get(n.toId) : null;
              if (!a || !b) return null;
              const ac = center(a);
              const bc = center(b);
              const p1 = edgeToward(a, bc.x, bc.y);
              const p2 = edgeToward(b, ac.x, ac.y);
              const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              const ah = 10;
              return (
                <g key={n.id}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={n.stroke || LINE} strokeWidth={2} />
                  <polygon
                    fill={n.stroke || LINE}
                    points={`${p2.x},${p2.y} ${p2.x - ah * Math.cos(ang - 0.4)},${p2.y - ah * Math.sin(ang - 0.4)} ${p2.x - ah * Math.cos(ang + 0.4)},${p2.y - ah * Math.sin(ang + 0.4)}`}
                  />
                </g>
              );
            }
            return null;
          })}
          {lineFrom && lineHover && (() => {
            const a = byId.get(lineFrom);
            if (!a) return null;
            const p1 = edgeToward(a, lineHover.x, lineHover.y);
            return <line x1={p1.x} y1={p1.y} x2={lineHover.x} y2={lineHover.y} stroke={LINE} strokeWidth={2} strokeDasharray="6 4" />;
          })()}
        </svg>
        {ghost && (
          <div
            className={`jam-ghost ${ghost.kind === "sticky" ? "jam-sticky" : ghost.kind === "text" ? "jam-label" : `jam-shape is-${shapeKind}`}`}
            style={{
              left: ghost.x,
              top: ghost.y,
              width: ghost.w,
              height: ghost.h,
              background: ghost.kind === "sticky" ? stickyColor : ghost.kind === "shape" ? "#fff" : "transparent",
              borderColor: ghost.kind === "shape" ? SHAPE_STROKE : undefined,
            }}
          />
        )}
        {nodes.map((n) => {
          if (n.kind === "pen" || n.kind === "line") return null;
          const on = selected.includes(n.id);
          const cls =
            n.kind === "sticky"
              ? `jam-sticky ${on ? "is-on" : ""}`
              : n.kind === "text"
                ? `jam-label ${on ? "is-on" : ""}`
                : `jam-shape is-${n.variant ?? "round"} ${on ? "is-on" : ""}`;
          return (
            <div
              key={n.id}
              className={cls}
              style={{
                left: n.x,
                top: n.y,
                width: n.w,
                height: n.h,
                background: n.kind === "text" ? "transparent" : n.fill,
                borderColor: n.kind === "shape" ? n.stroke : undefined,
              }}
            >
              <textarea
                data-id={n.id}
                readOnly={!editable || editing !== n.id}
                value={n.text}
                placeholder={n.kind === "sticky" ? "メモ" : n.kind === "text" ? "テキスト" : ""}
                style={{ fontSize: n.fontSize ?? (n.kind === "text" ? 28 : 18) }}
                onPointerDown={(e) => {
                  if (editing === n.id) e.stopPropagation();
                }}
                onFocus={() => startEdit(n.id)}
                onChange={(e) => patch(n.id, { text: e.target.value })}
                onBlur={() => setEditing((cur) => (cur === n.id ? null : cur))}
              />
            </div>
          );
        })}
        {marquee && <div className="jam-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
      </div>

      {cursors.map((c) => (
        <div key={c.id} className="jam-cursor" style={{ left: c.x * cam.z + cam.x, top: c.y * cam.z + cam.y, color: c.color }}>
          <svg width="16" height="20" viewBox="0 0 16 20">
            <path d="M1 1 L1 17 L5.5 13.2 L9.2 19.2 L11.4 18.1 L7.6 12.1 L14 12.1 Z" fill="currentColor" stroke="#fff" strokeWidth="1" />
          </svg>
          <span style={{ background: c.color }}>{c.name}</span>
        </div>
      ))}

      {empty && (
        <div className="jam-empty">
          <p>付箋を置いて、線でつなぐ</p>
          <p>S 付箋　T 文字　R 図形　L コネクタ</p>
        </div>
      )}
      </div>

      <div className="jam-bar">
        <ToolBtn icon={MousePointer2} label="選択" hot="V" on={tool === "select"} onClick={() => setTool("select")} />
        <ToolBtn icon={Hand} label="移動" hot="H" on={tool === "hand"} onClick={() => setTool("hand")} />
        <span className="jam-sep" />
        <div className="jam-fly">
          <ToolBtn icon={StickyNote} label="付箋" hot="S" on={tool === "sticky"} onClick={() => setTool("sticky")} />
          {tool === "sticky" && (
            <div className="jam-pop">
              {STICKY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`jam-swatch ${stickyColor === c ? "is-on" : ""}`}
                  style={{ background: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStickyColor(c);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="jam-fly">
          <ToolBtn icon={Square} label="図形" hot="R" on={tool === "shape"} onClick={() => setTool("shape")} />
          {tool === "shape" && (
            <div className="jam-pop">
              <button type="button" className={shapeKind === "round" ? "is-on" : ""} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShapeKind("round"); }}><Square size={16} /></button>
              <button type="button" className={shapeKind === "ellipse" ? "is-on" : ""} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShapeKind("ellipse"); }}><Circle size={16} /></button>
              <button type="button" className={shapeKind === "diamond" ? "is-on" : ""} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setShapeKind("diamond"); }}><Diamond size={16} /></button>
            </div>
          )}
        </div>
        <ToolBtn icon={Spline} label="コネクタ" hot="L" on={tool === "line"} onClick={() => { setTool("line"); setLineFrom(null); }} />
        <ToolBtn icon={Pencil} label="ペン" hot="P" on={tool === "pen"} onClick={() => setTool("pen")} />
        <span className="jam-sep" />
        <ToolBtn icon={Type} label="文字" hot="T" on={tool === "text"} onClick={() => setTool("text")} />
      </div>

      <div className="jam-zoom">
        <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); zoomBy(0.9); }} aria-label="縮小">
          <Minus size={14} />
        </button>
        <span>{Math.round(cam.z * 100)}%</span>
        <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); zoomBy(1.1); }} aria-label="拡大">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  hot,
  on,
  onClick,
}: {
  icon: typeof MousePointer2;
  label: string;
  hot: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`jam-tool ${on ? "is-on" : ""}`}
      title={`${label}（${hot}）`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}
