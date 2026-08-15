import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  AlignCenter,
  AlignCenterVertical,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  Circle,
  Diamond,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Scan,
  Spline,
  Square,
  StickyNote,
  Type,
  Undo2,
} from "lucide-react";
import { api } from "../lib/api";
import type { User } from "../lib/types";
import type { PresenceUser } from "./PresencePile";

const ORIGIN = "arcana-jam";
const CLIP = { nodes: [] as JamNode[], n: 0 };
const ZMIN = 0.2;
const ZMAX = 3.5;
const ZOOM_K = 0.01;

function clampZ(z: number) {
  return Math.min(ZMAX, Math.max(ZMIN, z));
}

function zoomAround(c: { x: number; y: number; z: number }, sx: number, sy: number, nextZ: number) {
  const z = clampZ(nextZ);
  if (z === c.z) return c;
  return { z, x: sx - ((sx - c.x) / c.z) * z, y: sy - ((sy - c.y) / c.z) * z };
}

function snapshot(list: JamNode[], ids: string[]) {
  const set = new Set(ids);
  const out: JamNode[] = [];
  for (const n of list) {
    if (set.has(n.id) && n.kind !== "line") out.push(clone(n));
  }
  for (const n of list) {
    if (n.kind === "line" && n.fromId && n.toId && set.has(n.fromId) && set.has(n.toId)) out.push(clone(n));
  }
  return out;
}
const STICKY = 240;
const STICKY_COLORS = ["#FFE299", "#FFD3A8", "#FFB8A8", "#FFA8DB", "#D3BDFF", "#A8DAFF", "#B3F4EF", "#B3EFBD", "#E6E6E6", "#FFFFFF"];
const INK = "#1e1e1e";
const LINE = "#b3b3b3";
const SHAPE_STROKE = "#b3b3b3";
const COLORS = ["#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#196a63"];
const STROKE_COLORS = [INK, "#5c5c5c", LINE, "#e16259", "#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#ffffff"];
const SHAPE_FILLS = ["#ffffff", "#FFE299", "#FFB8A8", "#D3BDFF", "#A8DAFF", "#B3EFBD", "#E6E6E6"];
const SELECT = "#0d99ff";
const GUIDE = "#f24822";
const SNAP = 8;

type Pt = { x: number; y: number };

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

function hitBox(n: JamNode, x: number, y: number) {
  return x >= n.x && y >= n.y && x <= n.x + n.w && y <= n.y + n.h;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function penBounds(points: Pt[]) {
  if (!points.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function boundsOf(n: JamNode) {
  if (n.kind === "pen" && n.points?.length) return penBounds(n.points);
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

function connectorEnds(n: JamNode, get: (id: string) => JamNode | undefined) {
  const a = n.fromId ? get(n.fromId) : undefined;
  const b = n.toId ? get(n.toId) : undefined;
  if (!a || !b) return null;
  const ac = center(a);
  const bc = center(b);
  return { p1: edgeToward(a, bc.x, bc.y), p2: edgeToward(b, ac.x, ac.y) };
}

function hitStroke(n: JamNode, x: number, y: number, pad: number, get: (id: string) => JamNode | undefined) {
  if (n.kind === "pen") {
    const pts = n.points;
    if (!pts?.length) return false;
    if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= pad;
    for (let i = 1; i < pts.length; i++) {
      if (distToSeg(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= pad) return true;
    }
    return false;
  }
  if (n.kind === "line") {
    const ends = connectorEnds(n, get);
    if (!ends) return false;
    return distToSeg(x, y, ends.p1.x, ends.p1.y, ends.p2.x, ends.p2.y) <= pad;
  }
  return false;
}

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }) {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}

function boxesOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function shiftNode(n: JamNode, dx: number, dy: number): JamNode {
  if (n.kind === "line") return n;
  if (n.kind === "pen" && n.points) {
    return { ...n, x: n.x + dx, y: n.y + dy, points: n.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  return { ...n, x: n.x + dx, y: n.y + dy };
}

type Box = { x: number; y: number; w: number; h: number };

function unionBoxes(boxes: Box[]) {
  if (!boxes.length) return null;
  let minX = boxes[0].x;
  let minY = boxes[0].y;
  let maxX = boxes[0].x + boxes[0].w;
  let maxY = boxes[0].y + boxes[0].h;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function snapDelta(moving: Box[], others: Box[], dx: number, dy: number, threshold: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const mx = moving.flatMap((m) => [m.x + dx, m.x + m.w / 2 + dx, m.x + m.w + dx]);
  const my = moving.flatMap((m) => [m.y + dy, m.y + m.h / 2 + dy, m.y + m.h + dy]);
  let bestX = threshold + 1;
  let adjX = 0;
  let v: number[] = [];
  for (const a of mx) {
    for (const b of xs) {
      const d = Math.abs(a - b);
      if (d < bestX) {
        bestX = d;
        adjX = b - a;
        v = [b];
      }
    }
  }
  let bestY = threshold + 1;
  let adjY = 0;
  let h: number[] = [];
  for (const a of my) {
    for (const b of ys) {
      const d = Math.abs(a - b);
      if (d < bestY) {
        bestY = d;
        adjY = b - a;
        h = [b];
      }
    }
  }
  return {
    dx: dx + (bestX <= threshold ? adjX : 0),
    dy: dy + (bestY <= threshold ? adjY : 0),
    v: bestX <= threshold ? v : [],
    h: bestY <= threshold ? h : [],
  };
}

function center(n: JamNode) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

type Side = "top" | "right" | "bottom" | "left";

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

function beside(n: JamNode, side: Side, gap = 48) {
  if (side === "top") return { x: n.x, y: n.y - n.h - gap };
  if (side === "right") return { x: n.x + n.w + gap, y: n.y };
  if (side === "bottom") return { x: n.x, y: n.y + n.h + gap };
  return { x: n.x - n.w - gap, y: n.y };
}

function stickyH(text: string, w: number, fontSize: number) {
  const inner = Math.max(80, w - 32);
  const ch = fontSize * 0.62;
  let rows = 0;
  for (const line of (text || " ").split("\n")) {
    rows += Math.max(1, Math.ceil((line.length * ch) / inner));
  }
  return Math.max(STICKY, 28 + rows * fontSize * 1.35);
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
  const worldRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const camRef = useRef({ x: 48, y: 48, z: 1 });
  const nodesRef = useRef<JamNode[]>([]);
  const awareRaf = useRef<number | null>(null);
  const camSync = useRef<number | null>(null);
  const camAnim = useRef<number | null>(null);
  const wheelRaf = useRef<number | null>(null);
  const wheelAcc = useRef({ x: 0, y: 0, factor: 1, sx: 0, sy: 0, zoom: false });
  const cursorBuf = useRef({ x: 0, y: 0 });
  const drag = useRef<null | {
    mode: "pan" | "move" | "pen" | "marquee" | "line" | "shape" | "resize" | "port";
    x: number;
    y: number;
    cx: number;
    cy: number;
    sx: number;
    sy: number;
    id?: string;
    ids?: string[];
    origin?: Record<string, { x: number; y: number; points?: Pt[] }>;
    editOnUp?: boolean;
    handle?: "se" | "e" | "s";
    ow?: number;
    oh?: number;
    ox?: number;
    oy?: number;
    opoints?: Pt[];
    side?: Side;
  }>(null);
  const moveRaf = useRef<number | null>(null);
  const pendingMove = useRef<null | { ids: string[]; origin: Record<string, { x: number; y: number; points?: Pt[] }>; dx: number; dy: number }>(null);
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
  const [marquee, setMarquee] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [busy, setBusy] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const pointerRef = useRef({ x: 0, y: 0 });

  const collab = useMemo(() => {
    const doc = new Y.Doc();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const params: Record<string, string> = {};
    if (shareToken) params.token = shareToken;
    const provider = new WebsocketProvider(`${proto}//${location.host}/api/collab`, pageId, doc, { params });
    const map = doc.getMap<JamNode>("jam.nodes");
    const order = doc.getArray<string>("jam.order");
    const undo = new Y.UndoManager([map, order], { trackedOrigins: new Set([ORIGIN]), captureTimeout: 400 });
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
    const next = pull();
    nodesRef.current = next;
    setNodes(next);
  }

  function put(n: JamNode, atEnd = true) {
    collab.doc.transact(() => {
      collab.map.set(n.id, clone(n));
      const ids = collab.order.toArray();
      if (!ids.includes(n.id) && atEnd) collab.order.push([n.id]);
    }, ORIGIN);
    nodesRef.current = [...nodesRef.current.filter((x) => x.id !== n.id), n];
    setNodes(nodesRef.current);
  }

  function patch(id: string, partial: Partial<JamNode>, sync = true) {
    const cur = (nodesRef.current.find((n) => n.id === id) ?? collab.map.get(id)) as JamNode | undefined;
    if (!isJam(cur)) return;
    const next = { ...cur, ...partial };
    nodesRef.current = nodesRef.current.map((n) => (n.id === id ? next : n));
    setNodes(nodesRef.current);
    if (!sync) return;
    collab.doc.transact(() => {
      collab.map.set(id, clone(next));
    }, ORIGIN);
  }

  function stopCamAnim() {
    if (camAnim.current != null) {
      cancelAnimationFrame(camAnim.current);
      camAnim.current = null;
    }
  }

  function paintCam(c: { x: number; y: number; z: number }, commit = false) {
    camRef.current = c;
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scale(${c.z})`;
    if (dotsRef.current) {
      dotsRef.current.style.backgroundSize = `${24 * c.z}px ${24 * c.z}px`;
      dotsRef.current.style.backgroundPosition = `${c.x}px ${c.y}px`;
    }
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(c.z * 100)}%`;
    if (commit) {
      if (camSync.current) window.clearTimeout(camSync.current);
      setCam(c);
      return;
    }
    if (camSync.current) window.clearTimeout(camSync.current);
    camSync.current = window.setTimeout(() => {
      camSync.current = null;
      setCam({ ...camRef.current });
    }, 120);
  }

  function paintGhost(g: { kind: "sticky" | "shape" | "text"; x: number; y: number; w: number; h: number } | null) {
    const el = ghostRef.current;
    if (!el) return;
    if (!g) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.left = `${g.x}px`;
    el.style.top = `${g.y}px`;
    el.style.width = `${g.w}px`;
    el.style.height = `${g.h}px`;
    el.style.background = g.kind === "sticky" ? stickyColor : g.kind === "shape" ? "#fff" : "transparent";
    el.style.borderColor = g.kind === "shape" ? SHAPE_STROKE : "transparent";
    el.className = `jam-ghost ${g.kind === "sticky" ? "jam-sticky" : g.kind === "text" ? "jam-label" : `jam-shape is-${shapeKind}`}`;
  }

  function sendCursor(w: { x: number; y: number }) {
    cursorBuf.current = w;
    if (awareRaf.current != null) return;
    awareRaf.current = requestAnimationFrame(() => {
      awareRaf.current = null;
      collab.provider.awareness.setLocalStateField("jam", cursorBuf.current);
    });
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
      setCursors((prev) => {
        if (prev.length === next.length && prev.every((c, i) => c.id === next[i].id && c.x === next[i].x && c.y === next[i].y)) return prev;
        return next;
      });
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
      const bodyText = nodesRef.current
        .map((n) => n.text)
        .filter(Boolean)
        .join(" ");
      void api(`/api/pages/${pageId}/index`, { method: "POST", body: JSON.stringify({ title, bodyText }) });
    }, 4000);
  }, [pageId, title, nodes.length]);

  function worldFromClient(clientX: number, clientY: number) {
    const r = boardRef.current?.getBoundingClientRect();
    const c = camRef.current;
    return {
      x: (clientX - (r?.left ?? 0) - c.x) / c.z,
      y: (clientY - (r?.top ?? 0) - c.y) / c.z,
    };
  }

  const activeTool: Tool = space || tool === "hand" ? "hand" : !editable ? "select" : tool;

  function topAt(x: number, y: number) {
    const list = nodesRef.current;
    const get = (id: string) => list.find((n) => n.id === id);
    const pad = Math.max(6, 10 / camRef.current.z);
    let stroke: JamNode | null = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.kind === "pen" || n.kind === "line") {
        if (!stroke && hitStroke(n, x, y, pad, get)) stroke = n;
        continue;
      }
      if (hitBox(n, x, y)) return n;
    }
    return stroke;
  }

  function startEdit(id: string) {
    if (!editable) return;
    setEditing(id);
    setSelected([id]);
    requestAnimationFrame(() => {
      boardRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-id="${id}"]`)?.focus();
    });
  }

  function backToSelect() {
    setTool("select");
    paintGhost(null);
  }

  function duplicateIds(ids: string[], dx = 24, dy = 24) {
    return insertNodes(snapshot(nodesRef.current, ids), dx, dy);
  }

  function insertNodes(items: JamNode[], dx = 24, dy = 24) {
    if (!items.length) return [] as string[];
    const idMap = new Map<string, string>();
    const copies = items.map((n) => {
      const next = clone(n);
      const id = nid();
      idMap.set(n.id, id);
      next.id = id;
      return next.kind === "line" ? next : shiftNode(next, dx, dy);
    });
    for (const n of copies) {
      if (n.fromId) n.fromId = idMap.get(n.fromId) ?? n.fromId;
      if (n.toId) n.toId = idMap.get(n.toId) ?? n.toId;
    }
    const created: string[] = [];
    collab.doc.transact(() => {
      for (const n of copies) {
        collab.map.set(n.id, clone(n));
        collab.order.push([n.id]);
        if (n.kind !== "line") created.push(n.id);
      }
    }, ORIGIN);
    refresh();
    setSelected(created);
    setTool("select");
    paintGhost(null);
    return created;
  }

  function copySelected() {
    const items = snapshot(nodesRef.current, selected);
    if (!items.length) return false;
    CLIP.nodes = items;
    CLIP.n = 1;
    void navigator.clipboard?.writeText(JSON.stringify({ arcanaJam: 1, nodes: items })).catch(() => {});
    return true;
  }

  async function pasteClipboard() {
    let items = CLIP.nodes;
    try {
      const raw = await navigator.clipboard.readText();
      const parsed = JSON.parse(raw) as { arcanaJam?: number; nodes?: unknown };
      if (parsed?.arcanaJam === 1 && Array.isArray(parsed.nodes)) {
        items = parsed.nodes.filter(isJam);
      }
    } catch {
      /* in-memory */
    }
    if (!items.length) return;
    const boxes = items.filter((n) => n.kind !== "line").map(boundsOf);
    const uni = unionBoxes(boxes);
    if (uni) {
      insertNodes(items, pointerRef.current.x - (uni.x + uni.w / 2), pointerRef.current.y - (uni.y + uni.h / 2));
    } else {
      insertNodes(items, 24, 24);
    }
    CLIP.nodes = items;
    CLIP.n = 1;
  }

  function spawnBeside(src: JamNode, side: Side, withLine: boolean, at?: { x: number; y: number }) {
    const pos = at ?? beside(src, side);
    const n = clone(src);
    n.id = nid();
    n.x = pos.x;
    n.y = pos.y;
    n.text = "";
    if (n.kind === "sticky") n.h = STICKY;
    put(n);
    if (withLine) {
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
        fromId: src.id,
        toId: n.id,
      });
    }
    startEdit(n.id);
    backToSelect();
  }

  function beginPort(e: ReactPointerEvent, id: string, side: Side) {
    e.preventDefault();
    e.stopPropagation();
    const n = collab.map.get(id);
    if (!isJam(n)) return;
    setLineFrom(id);
    setLineHover(center(n));
    drag.current = { mode: "port", x: 0, y: 0, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY, id, side };
    setBusy(true);
    boardRef.current?.setPointerCapture(e.pointerId);
  }

  function beginResize(e: ReactPointerEvent, id: string, handle: "se" | "e" | "s") {
    e.preventDefault();
    e.stopPropagation();
    const n = nodesRef.current.find((x) => x.id === id) ?? collab.map.get(id);
    if (!isJam(n)) return;
    const w = worldFromClient(e.clientX, e.clientY);
    const b = boundsOf(n);
    drag.current = {
      mode: "resize",
      x: w.x,
      y: w.y,
      cx: camRef.current.x,
      cy: camRef.current.y,
      sx: e.clientX,
      sy: e.clientY,
      id,
      handle,
      ow: b.w,
      oh: b.h,
      ox: b.x,
      oy: b.y,
      opoints: n.points?.map((p) => ({ ...p })),
    };
    setBusy(true);
    boardRef.current?.setPointerCapture(e.pointerId);
  }

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const flush = () => {
      wheelRaf.current = null;
      const acc = wheelAcc.current;
      const c = camRef.current;
      let next = c;
      if (acc.zoom && acc.factor !== 1) next = zoomAround(next, acc.sx, acc.sy, next.z * acc.factor);
      if (acc.x || acc.y) next = { ...next, x: next.x - acc.x, y: next.y - acc.y };
      acc.x = 0;
      acc.y = 0;
      acc.factor = 1;
      acc.zoom = false;
      if (next !== c) paintCam(next);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (camAnim.current != null) {
        cancelAnimationFrame(camAnim.current);
        camAnim.current = null;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      const acc = wheelAcc.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        acc.zoom = true;
        acc.sx = e.clientX - r.left;
        acc.sy = e.clientY - r.top;
        const k = Math.abs(dy) < 40 ? ZOOM_K : ZOOM_K * 0.35;
        acc.factor *= Math.exp(-Math.max(-240, Math.min(240, dy)) * k);
      } else {
        acc.x += dx;
        acc.y += dy;
      }
      if (wheelRaf.current == null) wheelRaf.current = requestAnimationFrame(flush);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelRaf.current != null) cancelAnimationFrame(wheelRaf.current);
      wheelRaf.current = null;
      if (camAnim.current != null) cancelAnimationFrame(camAnim.current);
      if (camSync.current) window.clearTimeout(camSync.current);
    };
  }, []);

  useLayoutEffect(() => {
    paintCam(camRef.current);
  }, []);

  function overUi(t: EventTarget | null) {
    return t instanceof Element && Boolean(t.closest(".jam-bar, .jam-zoom, .jam-title, .jam-float"));
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
      drag.current = { mode: "pan", x: e.clientX, y: e.clientY, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      paintGhost(null);
      setPanning(true);
      setBusy(true);
      return;
    }
    const w = worldFromClient(e.clientX, e.clientY);
    sendCursor(w);
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
      backToSelect();
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
      paintGhost(null);
      setBusy(true);
      drag.current = { mode: "shape", x: w.x, y: w.y, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY, id: n.id };
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
      backToSelect();
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
      drag.current = { mode: "pen", x: w.x, y: w.y, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY, id: n.id };
      setBusy(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === "line") {
      const t = topAt(w.x, w.y);
      if (!t || t.kind === "pen" || t.kind === "line") return;
      setLineFrom(t.id);
      setLineHover(w);
      setSelected([t.id]);
      drag.current = { mode: "line", x: w.x, y: w.y, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY, id: t.id };
      setBusy(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const t = topAt(w.x, w.y);
    if (t) {
      const already = !e.shiftKey && selected.length === 1 && selected[0] === t.id;
      const ids = e.shiftKey
        ? selected.includes(t.id)
          ? selected.filter((id) => id !== t.id)
          : [...selected, t.id]
        : selected.includes(t.id)
          ? selected
          : [t.id];
      setSelected(ids);
      if (e.shiftKey || t.kind === "line") return;
      if (e.detail >= 2 && (t.kind === "sticky" || t.kind === "text" || t.kind === "shape")) {
        startEdit(t.id);
        return;
      }
      let idsMove = ids;
      if (e.altKey) {
        idsMove = duplicateIds(ids);
        setSelected(idsMove);
      }
      const origin: Record<string, { x: number; y: number; points?: Pt[] }> = {};
      for (const id of idsMove) {
        const n = nodesRef.current.find((x) => x.id === id) ?? collab.map.get(id);
        if (isJam(n) && n.kind !== "line") origin[id] = { x: n.x, y: n.y, points: n.points?.map((p) => ({ ...p })) };
      }
      drag.current = {
        mode: "move",
        x: w.x,
        y: w.y,
        cx: camRef.current.x,
        cy: camRef.current.y,
        sx: e.clientX,
        sy: e.clientY,
        ids: idsMove,
        origin,
        editOnUp: already,
      };
      setBusy(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    setSelected([]);
    setLineFrom(null);
    drag.current = { mode: "marquee", x: w.x, y: w.y, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY };
    setMarquee({ x: w.x, y: w.y, w: 0, h: 0 });
    setBusy(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const w = worldFromClient(e.clientX, e.clientY);
    pointerRef.current = w;
    sendCursor(w);
    const d = drag.current;
    if (!d) {
      const hit = overUi(e.target) ? null : topAt(w.x, w.y);
      setHoverId(hit?.id ?? null);
      if (editable && !overUi(e.target)) paintGhost(ghostAt(activeTool, w));
      else paintGhost(null);
      return;
    }
    setHoverId(null);
    if (d.mode === "pan") {
      stopCamAnim();
      paintCam({ x: d.cx + (e.clientX - d.x), y: d.cy + (e.clientY - d.y), z: camRef.current.z });
      return;
    }
    if (d.mode === "move" && d.ids && d.origin) {
      let dx = w.x - d.x;
      let dy = w.y - d.y;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      pendingMove.current = { ids: d.ids, origin: d.origin, dx, dy };
      if (moveRaf.current == null) {
        moveRaf.current = requestAnimationFrame(() => {
          moveRaf.current = null;
          const p = pendingMove.current;
          if (!p) return;
          const movingIds = new Set(p.ids);
          const moving: Box[] = [];
          const others: Box[] = [];
          for (const n of nodesRef.current) {
            if (n.kind === "line") continue;
            const o = p.origin[n.id];
            const b = o ? { x: o.x, y: o.y, w: n.w, h: n.h } : boundsOf(n);
            if (o && n.kind === "pen" && o.points) Object.assign(b, penBounds(o.points));
            if (movingIds.has(n.id) && o) moving.push(b);
            else if (!movingIds.has(n.id)) others.push(boundsOf(n));
          }
          const snapped = others.length ? snapDelta(moving, others, p.dx, p.dy, SNAP / camRef.current.z) : { dx: p.dx, dy: p.dy, v: [] as number[], h: [] as number[] };
          p.dx = snapped.dx;
          p.dy = snapped.dy;
          setGuides({ v: snapped.v, h: snapped.h });
          nodesRef.current = nodesRef.current.map((n) => {
            const o = p.origin[n.id];
            if (!o) return n;
            if (n.kind === "pen" && o.points) {
              return { ...n, x: o.x + p.dx, y: o.y + p.dy, points: o.points.map((pt) => ({ x: pt.x + p.dx, y: pt.y + p.dy })) };
            }
            return { ...n, x: o.x + p.dx, y: o.y + p.dy };
          });
          setNodes(nodesRef.current);
        });
      }
      return;
    }
    if (d.mode === "shape" && d.id) {
      let x = Math.min(d.x, w.x);
      let y = Math.min(d.y, w.y);
      let ww = Math.max(1, Math.abs(w.x - d.x));
      let hh = Math.max(1, Math.abs(w.y - d.y));
      if (e.shiftKey) {
        const s = Math.max(ww, hh);
        ww = hh = s;
        x = w.x < d.x ? d.x - s : d.x;
        y = w.y < d.y ? d.y - s : d.y;
      }
      patch(d.id, { x, y, w: ww, h: hh }, false);
      return;
    }
    if (d.mode === "resize" && d.id && d.handle) {
      const dx = w.x - d.x;
      const dy = w.y - d.y;
      const ow = d.ow ?? 160;
      const oh = d.oh ?? 160;
      if (d.opoints && d.ox != null && d.oy != null) {
        let nw = d.handle === "s" ? ow : Math.max(8, ow + dx);
        let nh = d.handle === "e" ? oh : Math.max(8, oh + dy);
        if (e.shiftKey && d.handle === "se") {
          const s = Math.max(nw / ow, nh / oh);
          nw = Math.max(8, ow * s);
          nh = Math.max(8, oh * s);
        }
        const sx = ow < 1 ? 1 : nw / ow;
        const sy = oh < 1 ? 1 : nh / oh;
        const points = d.opoints.map((p) => ({
          x: d.ox! + (p.x - d.ox!) * sx,
          y: d.oy! + (p.y - d.oy!) * sy,
        }));
        patch(d.id, { ...penBounds(points), points }, false);
        return;
      }
      if (d.handle === "se") {
        if (e.shiftKey) {
          const s = Math.max((ow + dx) / ow, (oh + dy) / oh);
          patch(d.id, { w: Math.max(80, ow * s), h: Math.max(80, oh * s) }, false);
        } else {
          patch(d.id, { w: Math.max(80, ow + dx), h: Math.max(80, oh + dy) }, false);
        }
      } else if (d.handle === "e") patch(d.id, { w: Math.max(80, ow + dx) }, false);
      else patch(d.id, { h: Math.max(80, oh + dy) }, false);
      return;
    }
    if (d.mode === "port" || d.mode === "line") {
      setLineHover(w);
      return;
    }
    if (d.mode === "pen" && d.id) {
      const cur = nodesRef.current.find((n) => n.id === d.id);
      if (!isJam(cur) || !cur.points) return;
      const last = cur.points[cur.points.length - 1];
      if (last && Math.hypot(w.x - last.x, w.y - last.y) < 3) return;
      patch(d.id, { points: [...cur.points, { x: w.x, y: w.y }] }, false);
      return;
    }
    if (d.mode === "marquee") {
      setMarquee({ x: Math.min(d.x, w.x), y: Math.min(d.y, w.y), w: Math.abs(w.x - d.x), h: Math.abs(w.y - d.y) });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const w = worldFromClient(e.clientX, e.clientY);
    if (d?.mode === "pan") setCam({ ...camRef.current });
    if (d?.mode === "marquee" && marquee) {
      const r = marquee;
      const get = (id: string) => nodesRef.current.find((n) => n.id === id);
      const hits = nodesRef.current
        .filter((n) => {
          if (n.kind === "pen") return n.points?.some((p) => inRect(p.x, p.y, r)) || boxesOverlap(boundsOf(n), r);
          if (n.kind === "line") {
            const ends = connectorEnds(n, get);
            return ends ? inRect(ends.p1.x, ends.p1.y, r) || inRect(ends.p2.x, ends.p2.y, r) || boxesOverlap({ x: Math.min(ends.p1.x, ends.p2.x), y: Math.min(ends.p1.y, ends.p2.y), w: Math.abs(ends.p2.x - ends.p1.x), h: Math.abs(ends.p2.y - ends.p1.y) }, r) : false;
          }
          return boxesOverlap(n, r);
        })
        .map((n) => n.id);
      setSelected(hits);
    }
    if (d?.mode === "move" && d.ids && d.origin) {
      const dx = pendingMove.current?.dx ?? w.x - d.x;
      const dy = pendingMove.current?.dy ?? w.y - d.y;
      collab.doc.transact(() => {
        for (const id of d.ids!) {
          const cur = collab.map.get(id);
          const o = d.origin![id];
          if (isJam(cur) && o) {
            if (cur.kind === "pen" && o.points) {
              collab.map.set(id, clone({ ...cur, x: o.x + dx, y: o.y + dy, points: o.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }));
            } else if (cur.kind !== "line") {
              collab.map.set(id, clone({ ...cur, x: o.x + dx, y: o.y + dy }));
            }
          }
        }
      }, ORIGIN);
    }
    if (d?.mode === "shape" && d.id) {
      const cur = nodesRef.current.find((n) => n.id === d.id);
      if (isJam(cur) && (cur.w < 24 || cur.h < 24)) patch(d.id, { x: d.x - 80, y: d.y - 80, w: 160, h: 160 });
      else if (isJam(cur)) patch(d.id, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
      backToSelect();
    }
    if (d?.mode === "resize" && d.id) {
      const cur = nodesRef.current.find((n) => n.id === d.id);
      if (isJam(cur)) patch(d.id, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
    }
    if (d?.mode === "pen" && d.id) {
      const cur = nodesRef.current.find((n) => n.id === d.id);
      if (isJam(cur) && cur.points?.length) {
        patch(d.id, { ...penBounds(cur.points), points: cur.points });
        setSelected([d.id]);
      }
    }
    if (d?.mode === "port" && d.id && d.side) {
      const src = nodesRef.current.find((n) => n.id === d.id) ?? collab.map.get(d.id);
      if (isJam(src) && src.kind !== "line" && src.kind !== "pen") {
        const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 10;
        spawnBeside(src, d.side, moved, moved ? { x: w.x - src.w / 2, y: w.y - src.h / 2 } : undefined);
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
    }
    if (d?.mode === "move" && d.editOnUp && d.ids?.length === 1 && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) {
      const n = nodesRef.current.find((x) => x.id === d.ids![0]);
      if (n && (n.kind === "sticky" || n.kind === "text" || n.kind === "shape")) startEdit(n.id);
    }
    drag.current = null;
    pendingMove.current = null;
    setMarquee(null);
    setLineFrom(null);
    setLineHover(null);
    setGuides({ v: [], h: [] });
    setPanning(false);
    setBusy(false);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        e.preventDefault();
        if (editing || typing) {
          setEditing(null);
          if (e.target instanceof HTMLElement) e.target.blur();
          return;
        }
        if (tool !== "select") {
          backToSelect();
          setLineFrom(null);
          setLineHover(null);
          return;
        }
        setSelected([]);
        return;
      }
      if (e.key === " " && !editing && !typing) {
        e.preventDefault();
        setSpace(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && editing) {
        e.preventDefault();
        const src = collab.map.get(editing);
        if (isJam(src) && (src.kind === "sticky" || src.kind === "shape")) spawnBeside(src, "right", false);
        return;
      }
      if (editing || typing) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+" || e.code === "Equal")) {
        e.preventDefault();
        zoomBy(1.25);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.code === "Minus")) {
        e.preventDefault();
        zoomBy(0.8);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        zoomToLevel(1);
        return;
      }
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === "Digit1") {
        e.preventDefault();
        fitContent();
        return;
      }
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === "Digit2" && selected.length) {
        e.preventDefault();
        fitContent(selected);
        return;
      }
      if (e.key === "Enter" && selected.length === 1) {
        const n = nodesRef.current.find((x) => x.id === selected[0]);
        if (n && (n.kind === "sticky" || n.kind === "text" || n.kind === "shape")) {
          e.preventDefault();
          startEdit(n.id);
          return;
        }
      }
      if ((e.key === "]" || e.key === "[") && selected.length) {
        e.preventDefault();
        restack(selected, e.metaKey || e.ctrlKey ? (e.key === "]" ? "front" : "back") : e.key === "]" ? "forward" : "backward");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) collab.undo.redo();
        else collab.undo.undo();
        refresh();
        return;
      }
      if (!editable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(nodesRef.current.map((n) => n.id));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        if (copySelected()) removeIds(selected);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void pasteClipboard();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selected.length) setSelected(duplicateIds(selected));
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        if (selected.length) {
          e.preventDefault();
          removeIds(selected);
        }
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        for (const id of selected) {
          const n = nodesRef.current.find((x) => x.id === id) ?? collab.map.get(id);
          if (isJam(n) && n.kind !== "line") patch(id, shiftNode(n, dx, dy));
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "v") setTool("select");
      if (k === "h") setTool("hand");
      if (k === "s") setTool("sticky");
      if (k === "r") setTool("shape");
      if (k === "t") setTool("text");
      if (k === "l" || k === "x") setTool("line");
      if (k === "p" || k === "m") setTool("pen");
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

  function animateCam(to: { x: number; y: number; z: number }) {
    stopCamAnim();
    const from = { ...camRef.current };
    const t0 = performance.now();
    const dur = 160;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const ease = 1 - (1 - t) ** 3;
      paintCam(
        {
          x: from.x + (to.x - from.x) * ease,
          y: from.y + (to.y - from.y) * ease,
          z: from.z + (to.z - from.z) * ease,
        },
        t >= 1,
      );
      if (t < 1) camAnim.current = requestAnimationFrame(tick);
      else camAnim.current = null;
    };
    camAnim.current = requestAnimationFrame(tick);
  }

  function zoomBy(factor: number) {
    const el = boardRef.current;
    const from = camRef.current;
    const r = el?.getBoundingClientRect();
    const sx = r ? r.width / 2 : 0;
    const sy = r ? r.height / 2 : 0;
    const targetZ = clampZ(from.z * factor);
    if (targetZ === from.z) return;
    animateCam(zoomAround(from, sx, sy, targetZ));
  }

  function zoomToLevel(z: number) {
    const el = boardRef.current;
    const from = camRef.current;
    const r = el?.getBoundingClientRect();
    const sx = r ? r.width / 2 : 0;
    const sy = r ? r.height / 2 : 0;
    animateCam(zoomAround(from, sx, sy, clampZ(z)));
  }

  function fitContent(ids?: string[]) {
    const want = ids ? new Set(ids) : null;
    const boxes = nodesRef.current.filter((n) => n.kind !== "line" && (!want || want.has(n.id))).map(boundsOf);
    const uni = unionBoxes(boxes);
    const el = boardRef.current;
    if (!uni || !el || uni.w < 1 || uni.h < 1) {
      zoomToLevel(1);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 96;
    const z = clampZ(Math.min((r.width - pad) / uni.w, (r.height - pad) / uni.h, 1.25));
    animateCam({
      z,
      x: (r.width - uni.w * z) / 2 - uni.x * z,
      y: (r.height - uni.h * z) / 2 - uni.y * z,
    });
  }

  function restack(ids: string[], mode: "front" | "back" | "forward" | "backward") {
    const set = new Set(ids);
    const order = collab.order.toArray().filter((id) => collab.map.has(id));
    const picked = order.filter((id) => set.has(id));
    if (!picked.length) return;
    let next = order.filter((id) => !set.has(id));
    if (mode === "front") next = [...next, ...picked];
    else if (mode === "back") next = [...picked, ...next];
    else if (mode === "forward") {
      const last = Math.max(...picked.map((id) => order.indexOf(id)));
      const after = order.slice(last + 1).find((id) => !set.has(id));
      if (!after) next = [...next, ...picked];
      else {
        const i = next.indexOf(after);
        next = [...next.slice(0, i + 1), ...picked, ...next.slice(i + 1)];
      }
    } else {
      const first = Math.min(...picked.map((id) => order.indexOf(id)));
      const before = [...order.slice(0, first)].reverse().find((id) => !set.has(id));
      if (!before) next = [...picked, ...next];
      else {
        const i = next.indexOf(before);
        next = [...next.slice(0, i), ...picked, ...next.slice(i)];
      }
    }
    collab.doc.transact(() => {
      if (collab.order.length) collab.order.delete(0, collab.order.length);
      if (next.length) collab.order.push(next);
    }, ORIGIN);
    refresh();
  }

  function alignSelected(how: "left" | "center" | "right" | "top" | "middle" | "bottom") {
    const items = selected
      .map((id) => nodesRef.current.find((n) => n.id === id))
      .filter((n): n is JamNode => !!n && n.kind !== "line");
    if (items.length < 2) return;
    const boxes = items.map((n) => ({ n, b: boundsOf(n) }));
    const uni = unionBoxes(boxes.map((x) => x.b));
    if (!uni) return;
    collab.doc.transact(() => {
      for (const { n, b } of boxes) {
        let dx = 0;
        let dy = 0;
        if (how === "left") dx = uni.x - b.x;
        if (how === "center") dx = uni.x + uni.w / 2 - (b.x + b.w / 2);
        if (how === "right") dx = uni.x + uni.w - (b.x + b.w);
        if (how === "top") dy = uni.y - b.y;
        if (how === "middle") dy = uni.y + uni.h / 2 - (b.y + b.h / 2);
        if (how === "bottom") dy = uni.y + uni.h - (b.y + b.h);
        if (dx || dy) collab.map.set(n.id, clone(shiftNode(n, dx, dy)));
      }
    }, ORIGIN);
    refresh();
  }

  function bumpFont(id: string, dir: 1 | -1) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!isJam(n)) return;
    const cur = n.fontSize ?? (n.kind === "text" ? 28 : 18);
    const next = Math.max(12, Math.min(96, cur + dir * (cur >= 36 ? 8 : 4)));
    if (n.kind === "sticky") patch(id, { fontSize: next, h: stickyH(n.text, n.w, next) });
    else if (n.kind === "text") patch(id, { fontSize: next, h: Math.max(36, Math.round(next * 1.45)) });
    else patch(id, { fontSize: next });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const empty = nodes.length === 0;
  const ghosting = activeTool === "sticky" || activeTool === "shape" || activeTool === "text";
  const solo = selected.length === 1 ? byId.get(selected[0]) : undefined;
  const box =
    solo && solo.kind !== "line"
      ? (() => {
          const b = boundsOf(solo);
          return { l: b.x * cam.z + cam.x, t: b.y * cam.z + cam.y, w: Math.max(10, b.w * cam.z), h: Math.max(10, b.h * cam.z) };
        })()
      : null;
  const lineMid =
    solo?.kind === "line"
      ? (() => {
          const ends = connectorEnds(solo, (id) => byId.get(id));
          if (!ends) return null;
          return { l: ((ends.p1.x + ends.p2.x) / 2) * cam.z + cam.x, t: ((ends.p1.y + ends.p2.y) / 2) * cam.z + cam.y };
        })()
      : null;
  const multiBox =
    selected.length > 1
      ? (() => {
          const uni = unionBoxes(
            selected
              .map((id) => byId.get(id))
              .filter((n): n is JamNode => !!n && n.kind !== "line")
              .map(boundsOf),
          );
          return uni
            ? { l: uni.x * cam.z + cam.x, t: uni.y * cam.z + cam.y, w: uni.w * cam.z, h: uni.h * cam.z }
            : null;
        })()
      : null;
  const multiStickies = selected.length > 1 && selected.every((id) => byId.get(id)?.kind === "sticky");

  return (
    <div className={`jam ${activeTool === "hand" || panning ? "is-hand" : ""} ${panning ? "is-grabbing" : ""} ${activeTool === "pen" || activeTool === "line" ? "is-pen" : ""} ${ghosting ? "is-place" : ""}`}>
      <div
        ref={boardRef}
        className="jam-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          paintGhost(null);
          setHoverId(null);
        }}
      >
      <div ref={dotsRef} className="jam-dots" />
      <div ref={worldRef} className="jam-world">
        <svg className="jam-svg" aria-hidden>
          {nodes.map((n) => {
            const on = selected.includes(n.id);
            const hover = hoverId === n.id && !on;
            if (n.kind === "pen" && n.points?.length) {
              if (n.points.length === 1) {
                const p = n.points[0];
                return (
                  <g key={n.id}>
                    {(on || hover) && <circle cx={p.x} cy={p.y} r={8} fill="none" stroke={SELECT} strokeWidth={on ? 3 : 2} />}
                    <circle cx={p.x} cy={p.y} r={3} fill={n.stroke || INK} />
                  </g>
                );
              }
              const pts = n.points.map((p) => `${p.x},${p.y}`).join(" ");
              return (
                <g key={n.id}>
                  {(on || hover) && (
                    <polyline
                      fill="none"
                      stroke={SELECT}
                      strokeWidth={on ? 8 : 6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts}
                      opacity={on ? 1 : 0.45}
                    />
                  )}
                  <polyline
                    fill="none"
                    stroke={n.stroke || INK}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pts}
                  />
                </g>
              );
            }
            if (n.kind === "line") {
              const ends = connectorEnds(n, (id) => byId.get(id));
              if (!ends) return null;
              const { p1, p2 } = ends;
              const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              const ah = 10;
              const stroke = n.stroke || LINE;
              return (
                <g key={n.id}>
                  {(on || hover) && <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={SELECT} strokeWidth={on ? 7 : 5} strokeLinecap="round" opacity={on ? 1 : 0.45} />}
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={2} />
                  <polygon
                    fill={stroke}
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
        <div ref={ghostRef} className="jam-ghost jam-sticky" hidden />
        {nodes.map((n) => {
          if (n.kind === "pen" || n.kind === "line") return null;
          const on = selected.includes(n.id);
          const hover = hoverId === n.id && !on;
          const cls =
            n.kind === "sticky"
              ? `jam-sticky ${on ? "is-on" : ""} ${hover ? "is-hover" : ""}`
              : n.kind === "text"
                ? `jam-label ${on ? "is-on" : ""} ${hover ? "is-hover" : ""}`
                : `jam-shape is-${n.variant ?? "round"} ${on ? "is-on" : ""} ${hover ? "is-hover" : ""}`;
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
                tabIndex={editing === n.id ? 0 : -1}
                readOnly={!editable || editing !== n.id}
                value={n.text}
                placeholder={n.kind === "sticky" ? "メモ" : n.kind === "text" ? "テキスト" : ""}
                style={{ fontSize: n.fontSize ?? (n.kind === "text" ? 28 : 18) }}
                onPointerDown={(e) => {
                  if (editing === n.id) e.stopPropagation();
                }}
                onChange={(e) => {
                  const text = e.target.value;
                  if (n.kind === "sticky") patch(n.id, { text, h: stickyH(text, n.w, n.fontSize ?? 18) });
                  else patch(n.id, { text });
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && (n.kind === "sticky" || n.kind === "shape")) {
                    e.preventDefault();
                    spawnBeside(n, "right", false);
                  }
                }}
                onBlur={() => setEditing((cur) => (cur === n.id ? null : cur))}
              />
            </div>
          );
        })}
        {marquee && <div className="jam-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        {(guides.v.length > 0 || guides.h.length > 0) && (
          <svg className="jam-svg jam-guides" aria-hidden>
            {guides.v.map((x) => (
              <line key={`v${x}`} x1={x} y1={-20000} x2={x} y2={20000} stroke={GUIDE} vectorEffect="non-scaling-stroke" />
            ))}
            {guides.h.map((y) => (
              <line key={`h${y}`} x1={-20000} y1={y} x2={20000} y2={y} stroke={GUIDE} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        )}
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
          <p>S 付箋　T 文字　R 図形　L コネクタ　Shift+1 全体</p>
        </div>
      )}
      {box && solo && activeTool === "select" && editable && !busy && (
        <>
          {!editing && solo.kind !== "pen" &&
            (["top", "right", "bottom", "left"] as Side[]).map((side) => (
              <button
                key={side}
                type="button"
                className={`jam-port is-${side}`}
                style={
                  side === "top"
                    ? { left: box.l + box.w / 2, top: box.t }
                    : side === "right"
                      ? { left: box.l + box.w, top: box.t + box.h / 2 }
                      : side === "bottom"
                        ? { left: box.l + box.w / 2, top: box.t + box.h }
                        : { left: box.l, top: box.t + box.h / 2 }
                }
                title="隣に追加"
                onPointerDown={(e) => beginPort(e, solo.id, side)}
              />
            ))}
          {!editing && (
            <>
              <button type="button" className="jam-handle is-e" style={{ left: box.l + box.w, top: box.t + box.h / 2 }} onPointerDown={(e) => beginResize(e, solo.id, "e")} />
              <button type="button" className="jam-handle is-s" style={{ left: box.l + box.w / 2, top: box.t + box.h }} onPointerDown={(e) => beginResize(e, solo.id, "s")} />
              <button type="button" className="jam-handle is-se" style={{ left: box.l + box.w, top: box.t + box.h }} onPointerDown={(e) => beginResize(e, solo.id, "se")} />
            </>
          )}
          {solo.kind === "sticky" && (
            <div className="jam-float" style={{ left: box.l + box.w / 2, top: box.t }} onPointerDown={(e) => e.stopPropagation()}>
              {STICKY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`jam-swatch ${solo.fill === c ? "is-on" : ""}`}
                  style={{ background: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    patch(solo.id, { fill: c });
                    setStickyColor(c);
                  }}
                />
              ))}
            </div>
          )}
          {solo.kind === "pen" && (
            <div className="jam-float" style={{ left: box.l + box.w / 2, top: box.t }} onPointerDown={(e) => e.stopPropagation()}>
              <StrokeSwatches value={solo.stroke} onPick={(c) => patch(solo.id, { stroke: c })} />
            </div>
          )}
          {solo.kind === "shape" && (
            <div className="jam-float" style={{ left: box.l + box.w / 2, top: box.t }} onPointerDown={(e) => e.stopPropagation()}>
              {SHAPE_FILLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`jam-swatch ${solo.fill === c ? "is-on" : ""}`}
                  style={{ background: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    patch(solo.id, { fill: c });
                  }}
                />
              ))}
              <span className="jam-float-sep" />
              <StrokeSwatches value={solo.stroke} onPick={(c) => patch(solo.id, { stroke: c })} />
            </div>
          )}
          {(solo.kind === "text" || solo.kind === "sticky") && (
            <div
              className="jam-float"
              style={
                solo.kind === "text"
                  ? { left: box.l + box.w / 2, top: box.t }
                  : { left: box.l + box.w / 2, top: box.t + box.h, transform: "translate(-50%, 12px)" }
              }
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button type="button" className="jam-mini" title="小さく" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); bumpFont(solo.id, -1); }}>
                <Minus size={12} />
              </button>
              <span className="jam-mini-label">{solo.fontSize ?? (solo.kind === "text" ? 28 : 18)}</span>
              <button type="button" className="jam-mini" title="大きく" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); bumpFont(solo.id, 1); }}>
                <Plus size={12} />
              </button>
            </div>
          )}
        </>
      )}
      {lineMid && solo?.kind === "line" && activeTool === "select" && editable && !busy && (
        <div className="jam-float" style={{ left: lineMid.l, top: lineMid.t }} onPointerDown={(e) => e.stopPropagation()}>
          <StrokeSwatches value={solo.stroke} onPick={(c) => patch(solo.id, { stroke: c })} />
        </div>
      )}
      {multiBox && activeTool === "select" && editable && !busy && !editing && (
        <div className="jam-float jam-align" style={{ left: multiBox.l + multiBox.w / 2, top: multiBox.t }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" title="左揃え" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alignSelected("left"); }}><AlignLeft size={14} /></button>
          <button type="button" title="左右中央" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alignSelected("center"); }}><AlignCenter size={14} /></button>
          <button type="button" title="右揃え" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alignSelected("right"); }}><AlignRight size={14} /></button>
          <span className="jam-float-sep" />
          <button type="button" title="上揃え" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alignSelected("top"); }}><AlignStartVertical size={14} /></button>
          <button type="button" title="上下中央" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alignSelected("middle"); }}><AlignCenterVertical size={14} /></button>
          <button type="button" title="下揃え" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); alignSelected("bottom"); }}><AlignEndVertical size={14} /></button>
          {multiStickies && (
            <>
              <span className="jam-float-sep" />
              {STICKY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="jam-swatch"
                  style={{ background: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    for (const id of selected) patch(id, { fill: c });
                    setStickyColor(c);
                  }}
                />
              ))}
            </>
          )}
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
        {editable && (
          <>
            <button type="button" title="元に戻す（⌘Z）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); collab.undo.undo(); refresh(); }} aria-label="元に戻す">
              <Undo2 size={14} />
            </button>
            <button type="button" title="やり直す（⌘⇧Z）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); collab.undo.redo(); refresh(); }} aria-label="やり直す">
              <Redo2 size={14} />
            </button>
            <span className="jam-zoom-sep" />
          </>
        )}
        <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); zoomBy(0.8); }} aria-label="縮小">
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="jam-zoom-pct"
          title="100%に戻す（⌘0）"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            zoomToLevel(1);
          }}
        >
          <span ref={zoomLabelRef}>{Math.round(cam.z * 100)}%</span>
        </button>
        <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); zoomBy(1.25); }} aria-label="拡大">
          <Plus size={14} />
        </button>
        <button type="button" title="全体を表示（Shift+1）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); fitContent(); }} aria-label="全体を表示">
          <Scan size={14} />
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

function StrokeSwatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <>
      {STROKE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`jam-swatch ${value === c ? "is-on" : ""}`}
          style={{ background: c }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPick(c);
          }}
        />
      ))}
    </>
  );
}
