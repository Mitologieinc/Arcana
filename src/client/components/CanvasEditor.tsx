import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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
  CircleHelp,
  Diamond,
  Frame,
  Group,
  Hand,
  Highlighter,
  ImageDown,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Scan,
  Smile,
  Spline,
  Square,
  StickyNote,
  Type,
  Undo2,
  Ungroup,
  Unlock,
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
const SECTION_COLORS = ["#E8F0FE", "#E6F4EA", "#FEF7E0", "#FCE8E6", "#F3E8FD", "#E0F2F1", "#F1F0ED"];
const STAMPS = ["👍", "❤️", "⭐", "🎉", "🔥", "👀", "✅", "❓"];
const PEN_WIDTHS = [2, 4, 8];
const MARKER_WIDTHS = [12, 18, 28];
const SELECT = "#0d99ff";
const GUIDE = "#f24822";
const SNAP = 8;
const GRID = 12;

function gridFade(screen: number) {
  if (screen < 6) return 0;
  if (screen < 10) return (screen - 6) / 4;
  if (screen < 22) return 1;
  if (screen < 36) return (36 - screen) / 14;
  return 0;
}

function paintGrid(el: HTMLDivElement, x: number, y: number, z: number) {
  let step = GRID;
  const ideal = 14 / z;
  while (step < ideal * 0.85) step *= 2;
  while (step / 2 >= ideal * 0.85 && step > 0.5) step /= 2;
  const coarse = step * z;
  const fine = (step / 2) * z;
  const oc = gridFade(coarse);
  const of = gridFade(fine);
  const layers: string[] = [];
  const sizes: string[] = [];
  if (oc > 0.02) {
    layers.push(`radial-gradient(circle 1.25px at 0 0, rgba(var(--jam-dot), ${0.75 * oc}) 1.1px, transparent 1.3px)`);
    sizes.push(`${coarse}px ${coarse}px`);
  }
  if (of > 0.02) {
    layers.push(`radial-gradient(circle 1.1px at 0 0, rgba(var(--jam-dot), ${0.4 * of}) 0.95px, transparent 1.15px)`);
    sizes.push(`${fine}px ${fine}px`);
  }
  const pos = layers.map(() => `${x}px ${y}px`).join(", ");
  el.style.backgroundImage = layers.length ? layers.join(", ") : "none";
  el.style.backgroundSize = sizes.join(", ");
  el.style.backgroundPosition = pos;
}

type Pt = { x: number; y: number };

type Tool = "select" | "hand" | "sticky" | "shape" | "text" | "line" | "pen" | "section" | "stamp";
type ShapeKind = "round" | "ellipse" | "diamond";
type Ink = "pen" | "marker";
type JamKind = "sticky" | "shape" | "text" | "pen" | "line" | "section" | "stamp";
type JamNode = {
  id: string;
  kind: JamKind;
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
  locked?: boolean;
  groupId?: string;
  strokeWidth?: number;
  ink?: Ink;
  votes?: number;
  emoji?: string;
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
  return k === "sticky" || k === "shape" || k === "text" || k === "pen" || k === "line" || k === "section" || k === "stamp";
}

function isStroke(n: JamNode) {
  return n.kind === "pen" || n.kind === "line";
}

function inkWidth(n: JamNode) {
  if (n.strokeWidth) return n.strokeWidth;
  return n.ink === "marker" ? 18 : 3;
}

function groupOf(list: JamNode[], id: string) {
  const n = list.find((x) => x.id === id);
  if (!n?.groupId) return [id];
  return list.filter((x) => x.groupId === n.groupId).map((x) => x.id);
}

function expandIds(list: JamNode[], ids: string[]) {
  const out = new Set<string>();
  for (const id of ids) {
    for (const g of groupOf(list, id)) out.add(g);
  }
  return [...out];
}

function sectionKids(list: JamNode[], section: JamNode) {
  return list.filter((n) => {
    if (n.id === section.id || n.kind === "line" || n.kind === "section") return false;
    const b = boundsOf(n);
    return inRect(b.x + b.w / 2, b.y + b.h / 2, section);
  });
}

function moveIds(list: JamNode[], ids: string[]) {
  const set = new Set(expandIds(list, ids));
  for (const id of [...set]) {
    const n = list.find((x) => x.id === id);
    if (n?.kind === "section") {
      for (const k of sectionKids(list, n)) set.add(k.id);
    }
  }
  return [...set];
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
  const curve = connectorCurve(n, get);
  return curve ? { p1: curve.p1, p2: curve.p2 } : null;
}

function connectorCurve(n: JamNode, get: (id: string) => JamNode | undefined) {
  const a = n.fromId ? get(n.fromId) : undefined;
  const b = n.toId ? get(n.toId) : undefined;
  if (!a || !b) return null;
  return curveBetween(a, b);
}

function curveBetween(a: JamNode, b: JamNode) {
  const ac = center(a);
  const bc = center(b);
  const p1 = edgeToward(a, bc.x, bc.y);
  const p2 = edgeToward(b, ac.x, ac.y);
  const o1x = p1.x - ac.x;
  const o1y = p1.y - ac.y;
  const o2x = p2.x - bc.x;
  const o2y = p2.y - bc.y;
  const l1 = Math.hypot(o1x, o1y) || 1;
  const l2 = Math.hypot(o2x, o2y) || 1;
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const k = Math.min(96, Math.max(28, dist * 0.42));
  const c1 = { x: p1.x + (o1x / l1) * k, y: p1.y + (o1y / l1) * k };
  const c2 = { x: p2.x + (o2x / l2) * k, y: p2.y + (o2y / l2) * k };
  const ang = Math.atan2(p2.y - c2.y, p2.x - c2.x);
  return {
    p1,
    p2,
    c1,
    c2,
    ang,
    d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
  };
}

function curveToPoint(from: JamNode, hover: Pt) {
  const ac = center(from);
  const p1 = edgeToward(from, hover.x, hover.y);
  const o1x = p1.x - ac.x;
  const o1y = p1.y - ac.y;
  const l1 = Math.hypot(o1x, o1y) || 1;
  const dist = Math.hypot(hover.x - p1.x, hover.y - p1.y);
  const k = Math.min(96, Math.max(28, dist * 0.42));
  const c1 = { x: p1.x + (o1x / l1) * k, y: p1.y + (o1y / l1) * k };
  const c2 = { x: hover.x - (hover.x - p1.x) * 0.28, y: hover.y - (hover.y - p1.y) * 0.28 };
  return `M${p1.x} ${p1.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${hover.x} ${hover.y}`;
}

function bezierAt(p1: Pt, c1: Pt, c2: Pt, p2: Pt, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
    y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
  };
}

function hitCurve(p1: Pt, c1: Pt, c2: Pt, p2: Pt, x: number, y: number, pad: number) {
  let prev = p1;
  for (let i = 1; i <= 14; i++) {
    const pt = bezierAt(p1, c1, c2, p2, i / 14);
    if (distToSeg(x, y, prev.x, prev.y, pt.x, pt.y) <= pad) return true;
    prev = pt;
  }
  return false;
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
    const curve = connectorCurve(n, get);
    if (!curve) return false;
    return hitCurve(curve.p1, curve.c1, curve.c2, curve.p2, x, y, pad);
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of (text || "").split("\n")) {
    if (!para) {
      out.push("");
      continue;
    }
    let cur = "";
    for (const ch of para) {
      const next = cur + ch;
      if (cur && ctx.measureText(next).width > maxW) {
        out.push(cur);
        cur = ch;
      } else cur = next;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function drawJam(ctx: CanvasRenderingContext2D, n: JamNode, get: (id: string) => JamNode | undefined) {
  if (n.kind === "line") {
    const curve = connectorCurve(n, get);
    if (!curve) return;
    ctx.save();
    ctx.strokeStyle = n.stroke || LINE;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(curve.p1.x, curve.p1.y);
    ctx.bezierCurveTo(curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y, curve.p2.x, curve.p2.y);
    ctx.stroke();
    const ah = 10;
    ctx.fillStyle = n.stroke || LINE;
    ctx.beginPath();
    ctx.moveTo(curve.p2.x, curve.p2.y);
    ctx.lineTo(curve.p2.x - ah * Math.cos(curve.ang - 0.4), curve.p2.y - ah * Math.sin(curve.ang - 0.4));
    ctx.lineTo(curve.p2.x - ah * Math.cos(curve.ang + 0.4), curve.p2.y - ah * Math.sin(curve.ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  if (n.kind === "pen" && n.points?.length) {
    ctx.save();
    ctx.strokeStyle = n.stroke || INK;
    ctx.lineWidth = inkWidth(n);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (n.ink === "marker") {
      ctx.globalAlpha = 0.38;
      ctx.globalCompositeOperation = "multiply";
    }
    ctx.beginPath();
    ctx.moveTo(n.points[0].x, n.points[0].y);
    for (let i = 1; i < n.points.length; i++) ctx.lineTo(n.points[i].x, n.points[i].y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (n.kind === "stamp") {
    ctx.save();
    ctx.font = `${Math.round(n.w * 0.72)}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-sans") || "sans-serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n.emoji || "👍", n.x + n.w / 2, n.y + n.h / 2);
    ctx.restore();
    return;
  }
  ctx.save();
  if (n.kind === "section") {
    ctx.fillStyle = n.fill || SECTION_COLORS[0];
    roundRect(ctx, n.x, n.y, n.w, n.h, 12);
    ctx.fill();
    ctx.font = `650 ${n.fontSize ?? 16}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-sans") || "sans-serif"}`;
    ctx.fillStyle = "#1e1e1e";
    ctx.textBaseline = "top";
    ctx.fillText(n.text || "セクション", n.x + 14, n.y + 10);
    ctx.restore();
    return;
  }
  if (n.kind === "shape") {
    ctx.fillStyle = n.fill || "#fff";
    ctx.strokeStyle = n.stroke || SHAPE_STROKE;
    ctx.lineWidth = 2;
    if (n.variant === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(n.x + n.w / 2, n.y + n.h / 2, n.w / 2, n.h / 2, 0, 0, Math.PI * 2);
    } else if (n.variant === "diamond") {
      ctx.beginPath();
      ctx.moveTo(n.x + n.w / 2, n.y);
      ctx.lineTo(n.x + n.w, n.y + n.h / 2);
      ctx.lineTo(n.x + n.w / 2, n.y + n.h);
      ctx.lineTo(n.x, n.y + n.h / 2);
      ctx.closePath();
    } else {
      roundRect(ctx, n.x, n.y, n.w, n.h, 8);
    }
    ctx.fill();
    ctx.stroke();
  } else if (n.kind === "sticky") {
    ctx.fillStyle = n.fill || STICKY_COLORS[0];
    ctx.fillRect(n.x, n.y, n.w, n.h);
  }
  if (n.text) {
    const size = n.fontSize ?? (n.kind === "text" ? 28 : 18);
    ctx.fillStyle = "#1e1e1e";
    ctx.font = `${n.kind === "text" ? 650 : 500} ${size}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-sans") || "sans-serif"}`;
    ctx.textBaseline = "top";
    const pad = n.kind === "text" ? 0 : 16;
    const lines = wrapLines(ctx, n.text, Math.max(20, n.w - pad * 2));
    const startY = n.kind === "shape" ? n.y + n.h * 0.18 : n.y + pad;
    lines.forEach((line, i) => {
      const x = n.kind === "shape" ? n.x + n.w / 2 : n.x + pad;
      if (n.kind === "shape") ctx.textAlign = "center";
      ctx.fillText(line, x, startY + i * size * 1.35);
    });
  }
  if (n.votes) {
    ctx.textAlign = "left";
    ctx.font = "650 13px sans-serif";
    ctx.fillStyle = "#1e1e1e";
    ctx.fillText(`👍 ${n.votes}`, n.x + 8, n.y + n.h - 22);
  }
  ctx.restore();
}

export function CanvasEditor({
  pageId,
  user,
  shareToken,
  editable,
  title,
  followClientId,
  onFollowEnd,
  onPresence,
}: {
  pageId: string;
  user: User;
  shareToken?: string;
  editable: boolean;
  title: string;
  followClientId?: number | null;
  onFollowEnd?: () => void;
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
  const remotes = useRef(new Map<string, { id: string; tx: number; ty: number; x: number; y: number }>());
  const cursorEls = useRef(new Map<string, HTMLDivElement>());
  const cursorRaf = useRef<number | null>(null);
  const cursorLast = useRef(0);
  const selectedRef = useRef<string[]>([]);
  const chatRef = useRef("");
  const followRef = useRef<number | null>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
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
  const [peers, setPeers] = useState<{ id: string; name: string; color: string; chat?: string; sel?: string[] }[]>([]);
  const [chat, setChat] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [lineFrom, setLineFrom] = useState<string | null>(null);
  const [lineHover, setLineHover] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [busy, setBusy] = useState(false);
  const [panning, setPanning] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [penColor, setPenColor] = useState(INK);
  const [penInk, setPenInk] = useState<Ink>("pen");
  const [penWidth, setPenWidth] = useState(3);
  const [markerWidth, setMarkerWidth] = useState(18);
  const [sectionColor, setSectionColor] = useState(SECTION_COLORS[0]);
  const [stampEmoji, setStampEmoji] = useState(STAMPS[0]);
  const [menu, setMenu] = useState<null | { x: number; y: number; world: Pt }>(null);
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

  function paintCursors() {
    const c = camRef.current;
    remotes.current.forEach((r) => {
      const el = cursorEls.current.get(r.id);
      if (!el) return;
      el.style.transform = `translate3d(${r.x * c.z + c.x}px, ${r.y * c.z + c.y}px, 0)`;
    });
  }

  function tickCursors(now: number) {
    const dt = Math.min(32, now - (cursorLast.current || now));
    cursorLast.current = now;
    const k = 1 - Math.exp(-dt / 72);
    let moving = false;
    remotes.current.forEach((r) => {
      const dx = r.tx - r.x;
      const dy = r.ty - r.y;
      if (dx * dx + dy * dy < 0.04) {
        r.x = r.tx;
        r.y = r.ty;
      } else {
        r.x += dx * k;
        r.y += dy * k;
        moving = true;
      }
    });
    paintCursors();
    if (followRef.current != null) {
      const r = remotes.current.get(String(followRef.current));
      if (r) centerOnWorld(r.x, r.y);
    }
    if (moving || followRef.current != null) cursorRaf.current = requestAnimationFrame(tickCursors);
    else cursorRaf.current = null;
  }

  function startCursorTick() {
    if (cursorRaf.current != null) return;
    cursorLast.current = performance.now();
    cursorRaf.current = requestAnimationFrame(tickCursors);
  }

  function paintCam(c: { x: number; y: number; z: number }, commit = false) {
    camRef.current = c;
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) scale(${c.z})`;
    if (dotsRef.current) paintGrid(dotsRef.current, c.x, c.y, c.z);
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(c.z * 100)}%`;
    paintCursors();
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

  function paintGhost(g: { kind: "sticky" | "shape" | "text" | "section" | "stamp"; x: number; y: number; w: number; h: number } | null) {
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
    el.style.background = g.kind === "sticky" ? stickyColor : g.kind === "section" ? sectionColor : g.kind === "shape" ? "#fff" : "transparent";
    el.style.borderColor = g.kind === "shape" ? SHAPE_STROKE : "transparent";
    el.className = `jam-ghost ${g.kind === "sticky" ? "jam-sticky" : g.kind === "text" ? "jam-label" : g.kind === "section" ? "jam-section" : g.kind === "stamp" ? "jam-stamp" : `jam-shape is-${shapeKind}`}`;
  }

  function stopFollow() {
    if (followRef.current == null) return;
    followRef.current = null;
    onFollowEnd?.();
  }

  function centerOnWorld(x: number, y: number, commit = false) {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const z = camRef.current.z;
    paintCam({ z, x: r.width / 2 - x * z, y: r.height / 2 - y * z }, commit);
  }

  function flushJam() {
    collab.provider.awareness.setLocalStateField("jam", {
      x: cursorBuf.current.x,
      y: cursorBuf.current.y,
      chat: chatRef.current || undefined,
      sel: selectedRef.current.length ? selectedRef.current : undefined,
    });
  }

  function sendCursor(w: { x: number; y: number }) {
    cursorBuf.current = w;
    if (awareRaf.current != null) return;
    awareRaf.current = requestAnimationFrame(() => {
      awareRaf.current = null;
      flushJam();
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
      const next: { id: string; name: string; color: string }[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const raw = state.user as { name?: string; color?: string; id?: string } | undefined;
        if (!raw?.name) return;
        const p = state.jam as { x?: number; y?: number; chat?: string; sel?: string[] } | undefined;
        others.push({
          clientId,
          id: raw.id || String(clientId),
          name: raw.name,
          color: raw.color || "#37352f",
          x: typeof p?.x === "number" ? p.x : undefined,
          y: typeof p?.y === "number" ? p.y : undefined,
        });
        if (typeof p?.x === "number" && typeof p.y === "number") {
          const id = String(clientId);
          next.push({
            id,
            name: raw.name,
            color: raw.color || "#37352f",
            chat: p.chat,
            sel: Array.isArray(p.sel) ? p.sel : undefined,
          });
          const cur = remotes.current.get(id);
          if (cur) {
            cur.tx = p.x;
            cur.ty = p.y;
          } else {
            remotes.current.set(id, { id, tx: p.x, ty: p.y, x: p.x, y: p.y });
          }
        }
      });
      for (const id of [...remotes.current.keys()]) {
        if (!next.some((p) => p.id === id)) remotes.current.delete(id);
      }
      onPresence?.(others);
      setPeers((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (c, i) =>
              c.id === next[i].id &&
              c.name === next[i].name &&
              c.color === next[i].color &&
              c.chat === next[i].chat &&
              (c.sel ?? []).join() === (next[i].sel ?? []).join(),
          )
        )
          return prev;
        return next;
      });
      startCursorTick();
    };
    awareness.on("change", report);
    collab.provider.on("status", report);
    report();
    return () => {
      awareness.off("change", report);
      collab.provider.off("status", report);
      if (cursorRaf.current != null) cancelAnimationFrame(cursorRaf.current);
      cursorRaf.current = null;
    };
  }, [collab, user, onPresence]);

  useEffect(() => {
    selectedRef.current = selected;
    flushJam();
  }, [selected]);

  useEffect(() => {
    followRef.current = followClientId ?? null;
    if (followClientId == null) return;
    const r = remotes.current.get(String(followClientId));
    if (r) {
      const el = boardRef.current;
      if (el) {
        const box = el.getBoundingClientRect();
        const z = camRef.current.z;
        animateCam({ z, x: box.width / 2 - r.x * z, y: box.height / 2 - r.y * z });
      }
    }
    startCursorTick();
  }, [followClientId]);

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
    let section: JamNode | null = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.kind === "pen" || n.kind === "line") {
        if (!stroke && hitStroke(n, x, y, Math.max(pad, n.kind === "pen" ? inkWidth(n) / 2 + 2 : pad), get)) stroke = n;
        continue;
      }
      if (n.kind === "section") {
        if (!section && hitBox(n, x, y)) section = n;
        continue;
      }
      if (hitBox(n, x, y)) return n;
    }
    return stroke ?? section;
  }

  function startEdit(id: string) {
    if (!editable) return;
    const n = nodesRef.current.find((x) => x.id === id);
    if (n?.locked || n?.kind === "stamp" || n?.kind === "pen" || n?.kind === "line") return;
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
    const gmap = new Map<string, string>();
    for (const n of copies) {
      if (n.fromId) n.fromId = idMap.get(n.fromId) ?? n.fromId;
      if (n.toId) n.toId = idMap.get(n.toId) ?? n.toId;
      if (n.groupId) {
        if (!gmap.has(n.groupId)) gmap.set(n.groupId, nid());
        n.groupId = gmap.get(n.groupId);
      }
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
    if (!isJam(n) || n.locked || n.kind === "section" || n.kind === "stamp") return;
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
    if (!isJam(n) || n.locked) return;
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
      stopFollow();
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
    return t instanceof Element && Boolean(t.closest(".jam-bar, .jam-zoom, .jam-title, .jam-float, .jam-menu, .jam-help, .jam-chat, .jam-follow"));
  }

  function ghostAt(tool: Tool, w: { x: number; y: number }) {
    if (tool === "sticky") return { kind: "sticky" as const, x: w.x - STICKY / 2, y: w.y - STICKY / 2, w: STICKY, h: STICKY };
    if (tool === "shape") return { kind: "shape" as const, x: w.x - 80, y: w.y - 80, w: 160, h: 160 };
    if (tool === "text") return { kind: "text" as const, x: w.x, y: w.y - 16, w: 280, h: 48 };
    if (tool === "section") return { kind: "section" as const, x: w.x - 160, y: w.y - 120, w: 320, h: 240 };
    if (tool === "stamp") return { kind: "stamp" as const, x: w.x - 24, y: w.y - 24, w: 48, h: 48 };
    return null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (menu) setMenu(null);
    if (overUi(e.target)) return;
    if (e.button === 2) return;
    if (e.button === 1 || activeTool === "hand") {
      stopFollow();
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
        stroke: penColor,
        ink: penInk,
        strokeWidth: penInk === "marker" ? markerWidth : penWidth,
        points: [{ x: w.x, y: w.y }],
      };
      put(n);
      drag.current = { mode: "pen", x: w.x, y: w.y, cx: camRef.current.x, cy: camRef.current.y, sx: e.clientX, sy: e.clientY, id: n.id };
      setBusy(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === "section") {
      const n: JamNode = {
        id: nid(),
        kind: "section",
        x: w.x,
        y: w.y,
        w: 1,
        h: 1,
        text: "",
        fill: sectionColor,
        stroke: "transparent",
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
    if (activeTool === "stamp") {
      const t = topAt(w.x, w.y);
      if (t && t.kind !== "stamp" && t.kind !== "pen" && t.kind !== "line" && t.kind !== "section") {
        patch(t.id, { votes: (t.votes ?? 0) + 1 });
        return;
      }
      const n: JamNode = {
        id: nid(),
        kind: "stamp",
        x: w.x - 24,
        y: w.y - 24,
        w: 48,
        h: 48,
        text: "",
        fill: "transparent",
        stroke: "transparent",
        emoji: stampEmoji,
      };
      put(n);
      setSelected([n.id]);
      backToSelect();
      return;
    }
    if (activeTool === "line") {
      const t = topAt(w.x, w.y);
      if (lineFrom && t && t.id !== lineFrom && !isStroke(t) && t.kind !== "stamp") {
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
          fromId: lineFrom,
          toId: t.id,
        });
        setLineFrom(null);
        setLineHover(null);
        setSelected([t.id]);
        return;
      }
      if (!t || isStroke(t) || t.kind === "stamp") {
        setLineFrom(null);
        setLineHover(null);
        return;
      }
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
      const grouped = e.shiftKey
        ? selected.includes(t.id)
          ? selected.filter((id) => !groupOf(nodesRef.current, t.id).includes(id))
          : [...selected, ...groupOf(nodesRef.current, t.id)]
        : selected.includes(t.id)
          ? expandIds(nodesRef.current, selected)
          : groupOf(nodesRef.current, t.id);
      const already = !e.shiftKey && selected.length === 1 && selected[0] === t.id;
      setSelected(grouped);
      if (e.shiftKey || t.kind === "line") return;
      if (e.detail >= 2 && (t.kind === "sticky" || t.kind === "text" || t.kind === "shape" || t.kind === "section")) {
        startEdit(t.id);
        return;
      }
      if (t.locked) return;
      const unlocked = grouped.filter((id) => !nodesRef.current.find((x) => x.id === id)?.locked);
      if (!unlocked.length) return;
      let idsMove = moveIds(nodesRef.current, unlocked);
      if (e.altKey) {
        idsMove = duplicateIds(idsMove);
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
    if (activeTool === "select" && e.detail >= 2) {
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
    if (chatBoxRef.current && boardRef.current) {
      const r = boardRef.current.getBoundingClientRect();
      chatBoxRef.current.style.left = `${e.clientX - r.left + 18}px`;
      chatBoxRef.current.style.top = `${e.clientY - r.top + 20}px`;
    }
    sendCursor(w);
    const d = drag.current;
    if (!d) {
      const hit = overUi(e.target) ? null : topAt(w.x, w.y);
      setHoverId(hit?.id ?? null);
      if (lineFrom && activeTool === "line" && !overUi(e.target)) setLineHover(w);
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
      if (isJam(cur) && (cur.w < 24 || cur.h < 24)) {
        if (cur.kind === "section") patch(d.id, { x: d.x - 160, y: d.y - 120, w: 320, h: 240 });
        else patch(d.id, { x: d.x - 80, y: d.y - 80, w: 160, h: 160 });
      } else if (isJam(cur)) patch(d.id, { x: cur.x, y: cur.y, w: cur.w, h: cur.h });
      if (cur?.kind === "section") startEdit(d.id);
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
    let keepLine = false;
    if (d?.mode === "line" && d.id) {
      const t = topAt(w.x, w.y);
      if (t && t.id !== d.id && !isStroke(t) && t.kind !== "stamp") {
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
      } else if (t && t.id === d.id && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) {
        keepLine = true;
        setLineFrom(d.id);
      }
    }
    if (d?.mode === "move" && d.editOnUp && d.ids?.length === 1 && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) {
      const n = nodesRef.current.find((x) => x.id === d.ids![0]);
      if (n && (n.kind === "sticky" || n.kind === "text" || n.kind === "shape" || n.kind === "section")) startEdit(n.id);
    }
    drag.current = null;
    pendingMove.current = null;
    setMarquee(null);
    if (!keepLine) {
      setLineFrom(null);
      setLineHover(null);
    }
    setGuides({ v: [], h: [] });
    setPanning(false);
    setBusy(false);
  }

  function onContextMenu(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!editable || overUi(e.target)) return;
    const w = worldFromClient(e.clientX, e.clientY);
    const t = topAt(w.x, w.y);
    if (t) {
      if (!selected.includes(t.id)) setSelected([t.id]);
    } else {
      setSelected([]);
    }
    const r = boardRef.current?.getBoundingClientRect();
    setMenu({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), world: w });
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        e.preventDefault();
        if (help) {
          setHelp(false);
          return;
        }
        if (chat !== null) {
          chatRef.current = "";
          setChat(null);
          flushJam();
          return;
        }
        if (menu) {
          setMenu(null);
          return;
        }
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
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelp((v) => !v);
        return;
      }
      if (e.key === "/" && chat === null) {
        e.preventDefault();
        setChat("");
        chatRef.current = "";
        requestAnimationFrame(() => chatBoxRef.current?.querySelector("input")?.focus());
        return;
      }
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
        if (n && (n.kind === "sticky" || n.kind === "text" || n.kind === "shape" || n.kind === "section")) {
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
        const drop = selected.filter((id) => !nodesRef.current.find((n) => n.id === id)?.locked);
        if (copySelected() && drop.length) removeIds(drop);
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleLock();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        exportPng();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        const drop = selected.filter((id) => !nodesRef.current.find((n) => n.id === id)?.locked);
        if (drop.length) {
          e.preventDefault();
          removeIds(drop);
        }
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const ids = moveIds(nodesRef.current, selected.filter((id) => !nodesRef.current.find((n) => n.id === id)?.locked));
        for (const id of ids) {
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
      if (k === "p") {
        setPenInk("pen");
        setTool("pen");
      }
      if (k === "m") {
        setPenInk("marker");
        setTool("pen");
      }
      if (k === "f") setTool("section");
      if (k === "e") setTool("stamp");
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
  }, [editing, editable, selected, collab, menu, help, chat]);

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
    stopFollow();
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
    stopFollow();
    const el = boardRef.current;
    const from = camRef.current;
    const r = el?.getBoundingClientRect();
    const sx = r ? r.width / 2 : 0;
    const sy = r ? r.height / 2 : 0;
    animateCam(zoomAround(from, sx, sy, clampZ(z)));
  }

  function fitContent(ids?: string[]) {
    stopFollow();
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

  function groupSelected() {
    const ids = selected.filter((id) => {
      const n = nodesRef.current.find((x) => x.id === id);
      return n && n.kind !== "line" && !n.locked;
    });
    if (ids.length < 2) return;
    const groupId = nid();
    collab.doc.transact(() => {
      for (const id of ids) {
        const n = nodesRef.current.find((x) => x.id === id) ?? collab.map.get(id);
        if (isJam(n)) collab.map.set(id, clone({ ...n, groupId }));
      }
    }, ORIGIN);
    refresh();
    setSelected(ids);
  }

  function ungroupSelected() {
    const ids = selected.filter((id) => nodesRef.current.find((x) => x.id === id)?.groupId);
    if (!ids.length) return;
    collab.doc.transact(() => {
      for (const id of ids) {
        const n = nodesRef.current.find((x) => x.id === id) ?? collab.map.get(id);
        if (isJam(n)) {
          const next = { ...n };
          delete next.groupId;
          collab.map.set(id, clone(next));
        }
      }
    }, ORIGIN);
    refresh();
  }

  function toggleLock() {
    if (!selected.length) return;
    const items = selected
      .map((id) => nodesRef.current.find((n) => n.id === id))
      .filter((n): n is JamNode => !!n && n.kind !== "line");
    if (!items.length) return;
    const next = !items.every((n) => n.locked);
    collab.doc.transact(() => {
      for (const n of items) {
        const cur = { ...n, locked: next || undefined };
        if (!next) delete cur.locked;
        collab.map.set(n.id, clone(cur));
      }
    }, ORIGIN);
    refresh();
  }

  function exportPng() {
    const want = selected.length ? new Set(selected) : null;
    const list = nodesRef.current.filter((n) => {
      if (!want) return true;
      if (want.has(n.id)) return true;
      return n.kind === "line" && n.fromId && n.toId && want.has(n.fromId) && want.has(n.toId);
    });
    const boxes = list.filter((n) => n.kind !== "line").map(boundsOf);
    const uni = unionBoxes(boxes);
    if (!uni || uni.w < 2 || uni.h < 2) return;
    const pad = 40;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((uni.w + pad * 2) * scale));
    canvas.height = Math.max(1, Math.round((uni.h + pad * 2) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.translate(-uni.x + pad, -uni.y + pad);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-canvas").trim() || "#f7f6f3";
    ctx.fillRect(uni.x - pad, uni.y - pad, uni.w + pad * 2, uni.h + pad * 2);
    const get = (id: string) => list.find((n) => n.id === id) ?? nodesRef.current.find((n) => n.id === id);
    for (const n of list) {
      if (n.kind === "section") drawJam(ctx, n, get);
    }
    for (const n of list) {
      if (n.kind !== "section") drawJam(ctx, n, get);
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title || "canvas"}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
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
  const ghosting = activeTool === "sticky" || activeTool === "shape" || activeTool === "text" || activeTool === "section" || activeTool === "stamp";
  const canGroup = selected.filter((id) => {
    const n = byId.get(id);
    return n && n.kind !== "line" && !n.locked;
  }).length >= 2;
  const canUngroup = selected.some((id) => byId.get(id)?.groupId);
  const allLocked = selected.length > 0 && selected.every((id) => byId.get(id)?.locked);
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
          const curve = connectorCurve(solo, (id) => byId.get(id));
          if (!curve) return null;
          const mid = bezierAt(curve.p1, curve.c1, curve.c2, curve.p2, 0.5);
          return { l: mid.x * cam.z + cam.x, t: mid.y * cam.z + cam.y };
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
    <div className={`jam ${activeTool === "hand" || panning ? "is-hand" : ""} ${panning ? "is-grabbing" : ""} ${activeTool === "pen" || activeTool === "line" ? "is-pen" : ""} ${ghosting ? "is-place" : ""} ${penInk === "marker" && activeTool === "pen" ? "is-marker" : ""}`}>
      <div
        ref={boardRef}
        className="jam-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        onPointerLeave={() => {
          paintGhost(null);
          setHoverId(null);
          collab.provider.awareness.setLocalStateField("jam", null);
        }}
      >
      <div ref={dotsRef} className="jam-dots" />
      <div ref={worldRef} className="jam-world">
        <svg className="jam-svg" aria-hidden>
          {nodes.map((n) => {
            const on = selected.includes(n.id);
            const hover = hoverId === n.id && !on;
            if (n.kind === "pen" && n.points?.length) {
              const sw = inkWidth(n);
              if (n.points.length === 1) {
                const p = n.points[0];
                return (
                  <g key={n.id}>
                    {(on || hover) && <circle cx={p.x} cy={p.y} r={sw + 5} fill="none" stroke={SELECT} strokeWidth={on ? 3 : 2} />}
                    <circle cx={p.x} cy={p.y} r={sw / 2} fill={n.stroke || INK} opacity={n.ink === "marker" ? 0.38 : 1} />
                  </g>
                );
              }
              const pts = n.points.map((p) => `${p.x},${p.y}`).join(" ");
              return (
                <g key={n.id} style={n.ink === "marker" ? { mixBlendMode: "multiply" } : undefined}>
                  {(on || hover) && (
                    <polyline
                      fill="none"
                      stroke={SELECT}
                      strokeWidth={sw + (on ? 5 : 3)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts}
                      opacity={on ? 1 : 0.45}
                    />
                  )}
                  <polyline
                    fill="none"
                    stroke={n.stroke || INK}
                    strokeWidth={sw}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pts}
                    opacity={n.ink === "marker" ? 0.38 : 1}
                  />
                </g>
              );
            }
            if (n.kind === "line") {
              const curve = connectorCurve(n, (id) => byId.get(id));
              if (!curve) return null;
              const { p2, ang, d } = curve;
              const ah = 10;
              const stroke = n.stroke || LINE;
              return (
                <g key={n.id}>
                  {(on || hover) && <path d={d} fill="none" stroke={SELECT} strokeWidth={on ? 7 : 5} strokeLinecap="round" opacity={on ? 1 : 0.45} />}
                  <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
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
            return <path d={curveToPoint(a, lineHover)} fill="none" stroke={LINE} strokeWidth={2} strokeDasharray="6 4" strokeLinecap="round" />;
          })()}
        </svg>
        <div ref={ghostRef} className="jam-ghost jam-sticky" hidden />
        {nodes.map((n) => {
          if (n.kind === "pen" || n.kind === "line") return null;
          const on = selected.includes(n.id);
          const hover = hoverId === n.id && !on;
          const state = `${on ? "is-on" : ""} ${hover ? "is-hover" : ""} ${n.locked ? "is-locked" : ""}`;
          const cls =
            n.kind === "sticky"
              ? `jam-sticky ${state}`
              : n.kind === "text"
                ? `jam-label ${state}`
                : n.kind === "section"
                  ? `jam-section ${state}`
                  : n.kind === "stamp"
                    ? `jam-stamp ${state}`
                    : `jam-shape is-${n.variant ?? "round"} ${state}`;
          return (
            <div
              key={n.id}
              className={cls}
              style={{
                left: n.x,
                top: n.y,
                width: n.w,
                height: n.h,
                background: n.kind === "text" || n.kind === "stamp" ? "transparent" : n.fill,
                borderColor: n.kind === "shape" ? n.stroke : undefined,
                zIndex: n.kind === "section" ? 0 : 1,
              }}
            >
              {n.kind === "stamp" ? (
                <span className="jam-stamp-face">{n.emoji || "👍"}</span>
              ) : (
                <textarea
                  data-id={n.id}
                  tabIndex={editing === n.id ? 0 : -1}
                  readOnly={!editable || editing !== n.id || n.locked}
                  value={n.text}
                  placeholder={n.kind === "sticky" ? "メモ" : n.kind === "text" ? "テキスト" : n.kind === "section" ? "セクション" : ""}
                  style={{ fontSize: n.fontSize ?? (n.kind === "text" ? 28 : n.kind === "section" ? 16 : 18) }}
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
              )}
              {n.votes ? <span className="jam-votes">👍 {n.votes}</span> : null}
              {n.locked ? <span className="jam-lockdot" aria-hidden /> : null}
            </div>
          );
        })}
        {peers.flatMap((p) =>
          (p.sel ?? []).map((id) => {
            const n = byId.get(id);
            if (!n || n.kind === "line") return null;
            const b = boundsOf(n);
            return (
              <div
                key={`${p.id}-${id}`}
                className="jam-peer-sel"
                style={{ left: b.x, top: b.y, width: b.w, height: b.h, outlineColor: p.color }}
              />
            );
          }),
        )}
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

      {peers.map((c) => (
        <div
          key={c.id}
          className="jam-cursor"
          ref={(el) => {
            if (el) {
              cursorEls.current.set(c.id, el);
              const r = remotes.current.get(c.id);
              if (r) {
                const cam = camRef.current;
                el.style.transform = `translate3d(${r.x * cam.z + cam.x}px, ${r.y * cam.z + cam.y}px, 0)`;
              }
            } else {
              cursorEls.current.delete(c.id);
            }
          }}
          style={{ color: c.color }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M5.2 2.8v16.6l4.7-4.5 3.4 7.6 2.7-1.2-3.4-7.5h6.8Z"
              fill="currentColor"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ background: c.color }}>{c.name}</span>
          {c.chat ? <em className="jam-cursor-chat">{c.chat}</em> : null}
        </div>
      ))}
      {chat !== null && (
        <div ref={chatBoxRef} className="jam-chat">
          <input
            value={chat}
            placeholder="メッセージ"
            onChange={(e) => {
              setChat(e.target.value);
              chatRef.current = e.target.value;
              flushJam();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape" || e.key === "Enter") {
                e.preventDefault();
                chatRef.current = "";
                setChat(null);
                flushJam();
              }
            }}
          />
        </div>
      )}
      {followClientId != null && (
        <div className="jam-follow">
          {peers.find((p) => p.id === String(followClientId))?.name ?? "参加者"}を表示中
          <button type="button" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); stopFollow(); }}>
            やめる
          </button>
        </div>
      )}
      {help && (
        <div className="jam-help" onPointerDown={(e) => e.stopPropagation()}>
          <p>ショートカット</p>
          <ul>
            <li><kbd>V</kbd> 選択　<kbd>H</kbd> 移動　<kbd>S</kbd> 付箋</li>
            <li><kbd>R</kbd> 図形　<kbd>T</kbd> 文字　<kbd>L</kbd> 線　<kbd>P</kbd> ペン</li>
            <li><kbd>M</kbd> 蛍光ペン　<kbd>F</kbd> セクション　<kbd>E</kbd> スタンプ</li>
            <li><kbd>⌘G</kbd> グループ　<kbd>⌘⇧G</kbd> 解除　<kbd>⌘⇧L</kbd> ロック</li>
            <li><kbd>⌘Z</kbd> 戻す　<kbd>⌘D</kbd> 複製　<kbd>⌘⇧E</kbd> PNG</li>
            <li><kbd>⌘+</kbd> / <kbd>⌘-</kbd> ズーム　<kbd>Shift+1</kbd> 全体</li>
            <li><kbd>/</kbd> カーソル会話　<kbd>?</kbd> この一覧</li>
            <li>スタンプをオブジェクトに置くと投票</li>
          </ul>
          <button type="button" onPointerDown={() => setHelp(false)}>閉じる</button>
        </div>
      )}

      {empty && (
        <div className="jam-empty">
          <p>付箋を置いて、線でつなぐ</p>
          <p>F セクション　E スタンプ　M 蛍光ペン</p>
        </div>
      )}
      {box && solo && activeTool === "select" && editable && !busy && (
        <>
          {!editing && solo.kind !== "pen" && solo.kind !== "section" && solo.kind !== "stamp" && !solo.locked &&
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
          {!editing && !solo.locked && solo.kind !== "stamp" && (
            <>
              <button type="button" className="jam-handle is-e" style={{ left: box.l + box.w, top: box.t + box.h / 2 }} onPointerDown={(e) => beginResize(e, solo.id, "e")} />
              <button type="button" className="jam-handle is-s" style={{ left: box.l + box.w / 2, top: box.t + box.h }} onPointerDown={(e) => beginResize(e, solo.id, "s")} />
              <button type="button" className="jam-handle is-se" style={{ left: box.l + box.w, top: box.t + box.h }} onPointerDown={(e) => beginResize(e, solo.id, "se")} />
            </>
          )}
          {solo.kind === "sticky" && !solo.locked && (
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
          {solo.kind === "pen" && !solo.locked && (
            <div className="jam-float" style={{ left: box.l + box.w / 2, top: box.t }} onPointerDown={(e) => e.stopPropagation()}>
              <StrokeSwatches value={solo.stroke} onPick={(c) => patch(solo.id, { stroke: c })} />
              <span className="jam-float-sep" />
              {(solo.ink === "marker" ? MARKER_WIDTHS : PEN_WIDTHS).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`jam-chip ${inkWidth(solo) === w ? "is-on" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    patch(solo.id, { strokeWidth: w });
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          )}
          {solo.kind === "section" && !solo.locked && (
            <div className="jam-float" style={{ left: box.l + box.w / 2, top: box.t }} onPointerDown={(e) => e.stopPropagation()}>
              {SECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`jam-swatch ${solo.fill === c ? "is-on" : ""}`}
                  style={{ background: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    patch(solo.id, { fill: c });
                    setSectionColor(c);
                  }}
                />
              ))}
            </div>
          )}
          <div className="jam-float jam-lockbar" style={{ left: box.l + box.w, top: box.t, transform: "translate(12px, -50%)" }} onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" title={solo.locked ? "ロック解除（⌘⇧L）" : "ロック（⌘⇧L）"} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleLock(); }}>
              {solo.locked ? <Unlock size={14} /> : <Lock size={14} />}
            </button>
          </div>
          {solo.kind === "stamp" && !solo.locked && (
            <div className="jam-float" style={{ left: box.l + box.w / 2, top: box.t }} onPointerDown={(e) => e.stopPropagation()}>
              {STAMPS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`jam-stamp-pick ${solo.emoji === e ? "is-on" : ""}`}
                  onPointerDown={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    patch(solo.id, { emoji: e });
                    setStampEmoji(e);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {solo.kind === "shape" && !solo.locked && (
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
          {(solo.kind === "text" || solo.kind === "sticky" || solo.kind === "section") && !solo.locked && (
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
      {lineMid && solo?.kind === "line" && !solo.locked && activeTool === "select" && editable && !busy && (
        <div className="jam-float" style={{ left: lineMid.l, top: lineMid.t }} onPointerDown={(e) => e.stopPropagation()}>
          <StrokeSwatches value={solo.stroke} onPick={(c) => patch(solo.id, { stroke: c })} />
        </div>
      )}
      {multiBox && activeTool === "select" && !busy && (
        <div className="jam-selbox" style={{ left: multiBox.l - 4, top: multiBox.t - 4, width: multiBox.w + 8, height: multiBox.h + 8 }} />
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
          <span className="jam-float-sep" />
          <button type="button" title="グループ化（⌘G）" disabled={!canGroup} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); groupSelected(); }}><Group size={14} /></button>
          <button type="button" title="グループ解除（⌘⇧G）" disabled={!canUngroup} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); ungroupSelected(); }}><Ungroup size={14} /></button>
          <button type="button" title={allLocked ? "ロック解除（⌘⇧L）" : "ロック（⌘⇧L）"} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleLock(); }}>{allLocked ? <Unlock size={14} /> : <Lock size={14} />}</button>
        </div>
      )}
      {menu && (
        <div
          className="jam-menu"
          style={{ left: Math.min(menu.x, (boardRef.current?.clientWidth ?? 320) - 168), top: Math.min(menu.y, (boardRef.current?.clientHeight ?? 240) - 220) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={!selected.length}
            onPointerDown={(e) => {
              e.preventDefault();
              copySelected();
              setMenu(null);
            }}
          >
            コピー
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              pointerRef.current = menu.world;
              void pasteClipboard();
              setMenu(null);
            }}
          >
            貼り付け
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onPointerDown={(e) => {
              e.preventDefault();
              if (selected.length) setSelected(duplicateIds(selected));
              setMenu(null);
            }}
          >
            複製
          </button>
          <button
            type="button"
            disabled={!selected.filter((id) => !byId.get(id)?.locked).length}
            onPointerDown={(e) => {
              e.preventDefault();
              const drop = selected.filter((id) => !byId.get(id)?.locked);
              if (drop.length) removeIds(drop);
              setMenu(null);
            }}
          >
            削除
          </button>
          <span className="jam-menu-sep" />
          <button
            type="button"
            disabled={!canGroup}
            onPointerDown={(e) => {
              e.preventDefault();
              groupSelected();
              setMenu(null);
            }}
          >
            グループ化
          </button>
          <button
            type="button"
            disabled={!canUngroup}
            onPointerDown={(e) => {
              e.preventDefault();
              ungroupSelected();
              setMenu(null);
            }}
          >
            グループ解除
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onPointerDown={(e) => {
              e.preventDefault();
              toggleLock();
              setMenu(null);
            }}
          >
            {allLocked ? "ロック解除" : "ロック"}
          </button>
          <button
            type="button"
            disabled={!nodes.length}
            onPointerDown={(e) => {
              e.preventDefault();
              exportPng();
              setMenu(null);
            }}
          >
            PNG書き出し
          </button>
          <span className="jam-menu-sep" />
          <button
            type="button"
            disabled={!selected.length}
            onPointerDown={(e) => {
              e.preventDefault();
              if (selected.length) restack(selected, "front");
              setMenu(null);
            }}
          >
            最前面へ
          </button>
          <button
            type="button"
            disabled={!selected.length}
            onPointerDown={(e) => {
              e.preventDefault();
              if (selected.length) restack(selected, "back");
              setMenu(null);
            }}
          >
            最背面へ
          </button>
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
        <div className="jam-fly">
          <ToolBtn icon={penInk === "marker" ? Highlighter : Pencil} label={penInk === "marker" ? "蛍光ペン" : "ペン"} hot={penInk === "marker" ? "M" : "P"} on={tool === "pen"} onClick={() => setTool("pen")} />
          {tool === "pen" && (
            <div className="jam-pop jam-pop-stack">
              <div className="jam-pop-row">
                <button type="button" className={penInk === "pen" ? "is-on" : ""} title="ペン（P）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setPenInk("pen"); }}><Pencil size={16} /></button>
                <button type="button" className={penInk === "marker" ? "is-on" : ""} title="蛍光ペン（M）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setPenInk("marker"); }}><Highlighter size={16} /></button>
              </div>
              <div className="jam-pop-row">
                <StrokeSwatches value={penColor} onPick={setPenColor} />
              </div>
              <div className="jam-pop-row">
                {(penInk === "marker" ? MARKER_WIDTHS : PEN_WIDTHS).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`jam-chip ${(penInk === "marker" ? markerWidth : penWidth) === w ? "is-on" : ""}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (penInk === "marker") setMarkerWidth(w);
                      else setPenWidth(w);
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="jam-fly">
          <ToolBtn icon={Frame} label="セクション" hot="F" on={tool === "section"} onClick={() => setTool("section")} />
          {tool === "section" && (
            <div className="jam-pop">
              {SECTION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`jam-swatch ${sectionColor === c ? "is-on" : ""}`}
                  style={{ background: c }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSectionColor(c);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="jam-fly">
          <ToolBtn icon={Smile} label="スタンプ" hot="E" on={tool === "stamp"} onClick={() => setTool("stamp")} />
          {tool === "stamp" && (
            <div className="jam-pop">
              {STAMPS.map((mark) => (
                <button
                  key={mark}
                  type="button"
                  className={`jam-stamp-pick ${stampEmoji === mark ? "is-on" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStampEmoji(mark);
                  }}
                >
                  {mark}
                </button>
              ))}
            </div>
          )}
        </div>
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
        <button type="button" title="PNG書き出し（⌘⇧E）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); exportPng(); }} aria-label="PNG書き出し">
          <ImageDown size={14} />
        </button>
        <button type="button" title="ショートカット（?）" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setHelp((v) => !v); }} aria-label="ショートカット">
          <CircleHelp size={14} />
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
