export type DropEdge = "before" | "after";

export function dropEdgeFromY(clientY: number, rect: DOMRect): DropEdge {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

export function dropZoneFromY(clientY: number, rect: DOMRect): DropEdge | "inside" {
  const y = (clientY - rect.top) / rect.height;
  if (y < 0.28) return "before";
  if (y > 0.72) return "after";
  return "inside";
}

export function computePosition(
  items: { id: string; position: number }[],
  draggedId: string,
  targetId: string | null,
  edge: DropEdge,
): number {
  const others = items.filter((i) => i.id !== draggedId).sort((a, b) => a.position - b.position);
  if (!others.length) return 1;
  if (!targetId) {
    return others[others.length - 1].position + 1;
  }
  const idx = others.findIndex((i) => i.id === targetId);
  if (idx < 0) return others[others.length - 1].position + 1;
  const insertAt = edge === "before" ? idx : idx + 1;
  const prev = others[insertAt - 1];
  const next = others[insertAt];
  if (!prev && next) return next.position - 1;
  if (prev && !next) return prev.position + 1;
  if (prev && next) return (prev.position + next.position) / 2;
  return 1;
}

export function isDescendantOf(pages: { id: string; parentId: string | null }[], ancestorId: string, nodeId: string) {
  const map = new Map(pages.map((p) => [p.id, p]));
  let cur = map.get(nodeId);
  const seen = new Set<string>();
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    if (seen.has(cur.parentId)) return true;
    seen.add(cur.parentId);
    cur = map.get(cur.parentId);
  }
  return false;
}

export function reorderIds(ids: string[], draggedId: string, targetId: string, edge: DropEdge) {
  const next = ids.filter((id) => id !== draggedId);
  const idx = next.indexOf(targetId);
  if (idx < 0) {
    next.push(draggedId);
    return next;
  }
  next.splice(edge === "before" ? idx : idx + 1, 0, draggedId);
  return next;
}
