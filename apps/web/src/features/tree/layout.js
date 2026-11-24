// Family-tree layout for React Flow (pure functions, no React).
//
// DESCENDANT VIEW — family units:
//   [Person] [Spouse 1] [Spouse 2] [Spouse 3]        ← one row, ALL spouses together
//      └──────────●─────────●──────────●             ← a separate marriage rail per spouse
//                 │         │          │
//            children   children   children          ← grouped under their ACTUAL co-parent
//
//   * Children are grouped by the child's other parent taken from parent-child
//     edges, never by marriage order, so a child cannot be drawn under the
//     wrong spouse. Children whose other parent is unknown hang from a dot
//     directly under the person.
//   * Every unit owns a horizontal span [x, x + width]; spans never overlap,
//     so nodes cannot overlap however many spouses or children there are.
//   * The genealogy is a graph: a person reached twice (e.g. cousin marriage)
//     is drawn once; later occurrences become small reference cards.
//
// ANCESTOR VIEW — pedigree: the person at the bottom, parents above (father
// left, mother right), siblings to the left and spouses to the right.

export const SIZES = {
  CARD_W: 200,
  CARD_H: 96,
  SPOUSE_GAP: 30,
  SIB_GAP: 26,
  UNION_GAP: 56,
  ROW_GAP: 130,
  RAIL: 16,       // first marriage rail below the cards
  RAIL_STEP: 8,   // extra offset for each further marriage
  LANE_STEP: 9,   // vertical offset between child-edge lanes of different unions
  DOT: 12,
};

export const UNION_COLORS = ['#2a6149', '#b5653a', '#2f6f86', '#b0841f', '#7a4e8c', '#5c6b2f'];
const UNKNOWN = '__unknown__';

function push(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function indexGraph(graph) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentsOf = new Map();
  const childrenOf = new Map();
  const marriagesOf = new Map();
  for (const e of graph.edges) {
    if (e.type === 'parentChild') {
      push(parentsOf, e.target, { id: e.source, edge: e });
      push(childrenOf, e.source, { id: e.target, edge: e });
    } else if (e.type === 'marriage') {
      push(marriagesOf, e.source, { spouseId: e.target, edge: e, order: e.data?.spouse1Order });
      push(marriagesOf, e.target, { spouseId: e.source, edge: e, order: e.data?.spouse2Order });
    }
  }
  return { nodes, parentsOf, childrenOf, marriagesOf };
}

const birthYear = (idx, id) => idx.nodes.get(id)?.data?.person?.birth?.year ?? Infinity;
const nameOf = (idx, id) => {
  const p = idx.nodes.get(id)?.data?.person;
  return p?.full_name_bn || p?.full_name_en || '';
};

function sortMarriages(list) {
  return [...list].sort((a, b) =>
    (a.order ?? 99) - (b.order ?? 99)
    || (a.edge.data?.startDate?.year ?? 9999) - (b.edge.data?.startDate?.year ?? 9999)
    || a.edge.id.localeCompare(b.edge.id));
}

function sortChildren(idx, list) {
  return [...list].sort((a, b) => birthYear(idx, a.id) - birthYear(idx, b.id) || nameOf(idx, a.id).localeCompare(nameOf(idx, b.id)));
}

const sumWidths = (units, gap) => units.reduce((s, u) => s + u.width, 0) + gap * Math.max(0, units.length - 1);

class Output {
  constructor(idx) {
    this.idx = idx;
    this.nodes = [];
    this.edges = [];
    this.refCount = 0;
  }

  person(id, personId, x, y, extra = {}) {
    const src = this.idx.nodes.get(personId);
    this.nodes.push({
      id,
      type: 'person',
      position: { x, y },
      draggable: false,
      data: { ...src?.data, personId, ...extra },
    });
    return id;
  }

  ref(personId, x, y) {
    this.refCount += 1;
    const id = `${personId}::ref::${this.refCount}`;
    const src = this.idx.nodes.get(personId);
    this.nodes.push({
      id, type: 'personRef', position: { x, y }, draggable: false,
      data: { personId, person: src?.data?.person },
    });
    return id;
  }

  union(id, cx, cy, data) {
    const { DOT } = SIZES;
    this.nodes.push({
      id, type: 'union', position: { x: cx - DOT / 2, y: cy - DOT / 2 }, draggable: false, selectable: false, data,
    });
    return id;
  }

  edge(e) {
    this.edges.push(e);
  }
}

// ----------------------------------------------------------------- descendants

function buildDescendantUnit(id, idx, ctx) {
  const { CARD_W, SPOUSE_GAP, SIB_GAP, UNION_GAP } = SIZES;
  ctx.placed.add(id);
  const marriages = sortMarriages(idx.marriagesOf.get(id) ?? []);
  const spouseIds = marriages.map((m) => m.spouseId);

  // Group children by their other parent (the co-parent).
  const groups = new Map();
  for (const c of idx.childrenOf.get(id) ?? []) {
    const others = (idx.parentsOf.get(c.id) ?? []).map((p) => p.id).filter((p) => p !== id);
    const coParent = others.find((o) => spouseIds.includes(o)) ?? others[0] ?? UNKNOWN;
    push(groups, coParent, c);
  }

  const slots = marriages.map((m) => ({ spouseId: m.spouseId, marriage: m.edge }));
  for (const key of groups.keys()) {
    if (key !== UNKNOWN && !spouseIds.includes(key)) slots.push({ spouseId: key, marriage: null }); // unmarried co-parent
  }
  const spouses = slots.map((s) => {
    const ref = ctx.placed.has(s.spouseId) || !idx.nodes.has(s.spouseId);
    if (!ref) ctx.placed.add(s.spouseId);
    return { ...s, ref };
  });

  const unions = [];
  if (groups.has(UNKNOWN)) unions.push({ key: `${id}|unknown`, slotIndex: -1, children: groups.get(UNKNOWN) });
  spouses.forEach((s, i) => unions.push({
    key: `${id}|${s.spouseId}`, slotIndex: i, spouseId: s.spouseId, marriage: s.marriage, children: groups.get(s.spouseId) ?? [],
  }));

  const collapsed = ctx.collapsed.has(id);
  let hiddenCount = 0;
  for (const u of unions) {
    u.childUnits = [];
    for (const c of sortChildren(idx, u.children)) {
      if (collapsed) { hiddenCount += 1; continue; }
      if (ctx.placed.has(c.id)) {
        u.childUnits.push({ ref: true, id: c.id, width: CARD_W, edge: c.edge });
      } else {
        const child = buildDescendantUnit(c.id, idx, ctx);
        child.edge = c.edge;
        u.childUnits.push(child);
      }
    }
    u.width = sumWidths(u.childUnits, SIB_GAP);
  }

  const rowWidth = CARD_W * (1 + spouses.length) + SPOUSE_GAP * spouses.length;
  const withChildren = unions.filter((u) => u.childUnits.length);
  const unionsWidth = withChildren.reduce((s, u) => s + u.width, 0) + UNION_GAP * Math.max(0, withChildren.length - 1);
  return { id, spouses, unions, rowWidth, unionsWidth, width: Math.max(rowWidth, unionsWidth), hiddenCount, collapsed };
}

function placeDescendantUnit(unit, x0, row, out, ctx) {
  const { CARD_W, CARD_H, SPOUSE_GAP, SIB_GAP, UNION_GAP, ROW_GAP, RAIL, RAIL_STEP, LANE_STEP } = SIZES;
  const y = row * (CARD_H + ROW_GAP);
  const rx = x0 + (unit.width - unit.rowWidth) / 2;
  const childCount = unit.unions.reduce((s, u) => s + u.children.length, 0);

  out.person(unit.id, unit.id, rx, y, {
    isRoot: unit.id === ctx.rootId,
    collapsed: unit.collapsed,
    canCollapse: childCount > 0,
    hiddenCount: unit.hiddenCount,
  });

  unit.spouses.forEach((s, i) => {
    s.x = rx + (i + 1) * (CARD_W + SPOUSE_GAP);
    const spouseInfo = {
      ofId: unit.id,
      nth: s.marriage ? (s.marriage.source === unit.id ? s.marriage.data?.spouse1Order : s.marriage.data?.spouse2Order) : null,
      marriage: s.marriage?.data ?? null,
      colorIndex: i % UNION_COLORS.length,
      unmarried: !s.marriage,
    };
    s.nodeId = s.ref ? out.ref(s.spouseId, s.x, y) : out.person(s.spouseId, s.spouseId, s.x, y, { spouseInfo });
  });

  // Lanes for child edges start below the last marriage rail.
  const laneBase = y + CARD_H + RAIL + RAIL_STEP * Math.max(0, unit.spouses.length - 1) + 16;
  let cx = x0 + (unit.width - unit.unionsWidth) / 2;
  let lane = 0;

  for (const u of unit.unions) {
    const colorIndex = u.slotIndex >= 0 ? u.slotIndex % UNION_COLORS.length : -1;
    const dotX = u.slotIndex >= 0 ? unit.spouses[u.slotIndex].x + CARD_W / 2 : rx + CARD_W / 2;
    const dotY = y + CARD_H + RAIL + RAIL_STEP * Math.max(0, u.slotIndex);
    const unionId = `u:${u.key}`;

    if (u.slotIndex >= 0) {
      out.edge({
        id: `m:${u.key}`, source: unit.id, target: unit.spouses[u.slotIndex].nodeId,
        sourceHandle: 'bottom', targetHandle: 'bottom-in', type: 'marriage',
        data: { railY: dotY, status: u.marriage?.data?.status ?? null, colorIndex, unmarried: !u.marriage },
      });
    }
    if (!u.childUnits.length) continue;

    out.union(unionId, dotX, dotY, { colorIndex, unknown: u.slotIndex < 0 });
    if (u.slotIndex < 0) {
      out.edge({ id: `uk:${u.key}`, source: unit.id, target: unionId, sourceHandle: 'bottom', targetHandle: 'in', type: 'straight', className: 'unknown-parent', style: { stroke: '#9b9384', strokeDasharray: '3 3' } });
    }
    const centerY = laneBase + lane * LANE_STEP;
    lane += 1;

    for (const c of u.childUnits) {
      const childY = (row + 1) * (CARD_H + ROW_GAP);
      let childNodeId;
      if (c.ref) {
        childNodeId = out.ref(c.id, cx, childY);
      } else {
        placeDescendantUnit(c, cx, row + 1, out, ctx);
        childNodeId = c.id;
      }
      out.edge({
        id: `c:${u.key}:${c.id}`, source: unionId, target: childNodeId, sourceHandle: 'out', targetHandle: 'top', type: 'family',
        data: { centerY, colorIndex, relationshipType: c.edge?.data?.relationshipType ?? 'biological' },
      });
      cx += c.width + SIB_GAP;
    }
    cx += UNION_GAP - SIB_GAP;
  }
}

export function layoutDescendants(graph, { collapsed = new Set() } = {}) {
  const idx = indexGraph(graph);
  const ctx = { placed: new Set(), collapsed, rootId: graph.rootId };
  const out = new Output(idx);
  if (!idx.nodes.has(graph.rootId)) return { nodes: [], edges: [] };
  const unit = buildDescendantUnit(graph.rootId, idx, ctx);
  placeDescendantUnit(unit, 0, 0, out, ctx);
  return { nodes: out.nodes, edges: out.edges };
}

// ------------------------------------------------------------------- ancestors

function sortParents(idx, list) {
  const rank = (id) => ({ male: 0, female: 1 }[idx.nodes.get(id)?.data?.person?.sex] ?? 2);
  return [...list].sort((a, b) => rank(a.id) - rank(b.id));
}

function marriageBetween(idx, a, b) {
  return (idx.marriagesOf.get(a) ?? []).find((m) => m.spouseId === b)?.edge ?? null;
}

function buildAncestorUnit(id, idx, ctx) {
  const { CARD_W, SIB_GAP } = SIZES;
  ctx.placed.add(id);
  const parents = [];
  if (!ctx.collapsed.has(id)) {
    for (const p of sortParents(idx, idx.parentsOf.get(id) ?? [])) {
      if (!idx.nodes.has(p.id)) continue;
      if (ctx.placed.has(p.id)) {
        parents.push({ ref: true, id: p.id, width: CARD_W, edge: p.edge });
      } else {
        const unit = buildAncestorUnit(p.id, idx, ctx);
        unit.edge = p.edge;
        parents.push(unit);
      }
    }
  }
  const parentsWidth = sumWidths(parents, SIB_GAP);
  return { id, parents, parentsWidth, width: Math.max(CARD_W, parentsWidth) };
}

function placeAncestorUnit(unit, x0, row, out, ctx) {
  const { CARD_W, CARD_H, SIB_GAP, ROW_GAP, RAIL } = SIZES;
  const y = row * (CARD_H + ROW_GAP);
  const x = x0 + (unit.width - CARD_W) / 2;
  const parentCount = (ctx.idx.parentsOf.get(unit.id) ?? []).length;
  out.person(unit.id, unit.id, x, y, {
    isRoot: unit.id === ctx.rootId,
    collapsed: ctx.collapsed.has(unit.id),
    canCollapse: parentCount > 0,
  });
  unit.x = x;

  let px = x0 + (unit.width - unit.parentsWidth) / 2;
  const placed = [];
  for (const p of unit.parents) {
    if (p.ref) {
      placed.push({ ...p, nodeId: out.ref(p.id, px, y - CARD_H - ROW_GAP), x: px });
    } else {
      placeAncestorUnit(p, px, row - 1, out, ctx);
      placed.push({ ...p, nodeId: p.id, x: p.x });
    }
    px += p.width + SIB_GAP;
  }

  const parentY = y - CARD_H - ROW_GAP;
  const childTop = y;
  const centerY = parentY + CARD_H + RAIL + 22;
  const couple = placed.length === 2 ? marriageBetween(ctx.idx, placed[0].id, placed[1].id) : null;
  if (couple) {
    const unionId = `u:${placed[0].id}|${placed[1].id}`;
    if (!ctx.unions.has(unionId)) {
      ctx.unions.add(unionId);
      const dotX = (placed[0].x + placed[1].x + CARD_W) / 2;
      out.union(unionId, dotX, parentY + CARD_H + RAIL, { colorIndex: 0 });
      out.edge({
        id: `m:${unionId}`, source: placed[0].nodeId, target: placed[1].nodeId, sourceHandle: 'bottom', targetHandle: 'bottom-in',
        type: 'marriage', data: { railY: parentY + CARD_H + RAIL, status: couple.data?.status, colorIndex: 0 },
      });
    }
    out.edge({
      id: `c:${unionId}:${unit.id}`, source: unionId, target: unit.id, sourceHandle: 'out', targetHandle: 'top', type: 'family',
      data: { centerY, colorIndex: 0, relationshipType: placed[0].edge?.data?.relationshipType ?? 'biological' },
    });
    ctx.coupleUnion.set(unit.id, unionId);
  } else {
    for (const p of placed) {
      out.edge({
        id: `c:${p.nodeId}:${unit.id}`, source: p.nodeId, target: unit.id, sourceHandle: 'bottom', targetHandle: 'top', type: 'family',
        data: { centerY: Math.min(centerY, childTop - 12), colorIndex: 0, relationshipType: p.edge?.data?.relationshipType ?? 'biological' },
      });
    }
  }
}

export function layoutAncestors(graph, { collapsed = new Set() } = {}) {
  const { CARD_W, CARD_H, SIB_GAP, SPOUSE_GAP, RAIL, RAIL_STEP, ROW_GAP } = SIZES;
  const idx = indexGraph(graph);
  const out = new Output(idx);
  const rootId = graph.rootId;
  if (!idx.nodes.has(rootId)) return { nodes: [], edges: [] };
  const ctx = { idx, placed: new Set(), collapsed, rootId, unions: new Set(), coupleUnion: new Map() };
  const unit = buildAncestorUnit(rootId, idx, ctx);
  placeAncestorUnit(unit, 0, 0, out, ctx);

  // Root's spouses to the right, each with its own marriage rail.
  const rootX = unit.x;
  const spouses = sortMarriages(idx.marriagesOf.get(rootId) ?? []).filter((m) => !ctx.placed.has(m.spouseId));
  spouses.forEach((m, i) => {
    ctx.placed.add(m.spouseId);
    const x = rootX + (i + 1) * (CARD_W + SPOUSE_GAP);
    out.person(m.spouseId, m.spouseId, x, 0, {
      spouseInfo: {
        ofId: rootId, nth: m.order ?? null, marriage: m.edge.data, colorIndex: (i + 1) % UNION_COLORS.length,
      },
    });
    out.edge({
      id: `m:${rootId}|${m.spouseId}`, source: rootId, target: m.spouseId, sourceHandle: 'bottom', targetHandle: 'bottom-in',
      type: 'marriage', data: { railY: CARD_H + RAIL + RAIL_STEP * i, status: m.edge.data?.status, colorIndex: (i + 1) % UNION_COLORS.length },
    });
  });

  // Siblings to the left, connected to the shared parents.
  const rootParents = new Set((idx.parentsOf.get(rootId) ?? []).map((p) => p.id));
  const siblings = graph.nodes
    .filter((n) => n.data?.role === 'sibling' && !ctx.placed.has(n.id))
    .sort((a, b) => birthYear(idx, b.id) - birthYear(idx, a.id));
  const parentY = -(CARD_H + ROW_GAP);
  siblings.forEach((s, i) => {
    const x = rootX - (i + 1) * (CARD_W + SIB_GAP);
    out.person(s.id, s.id, x, 0, {});
    const shared = (idx.parentsOf.get(s.id) ?? []).filter((p) => rootParents.has(p.id));
    const unionId = ctx.coupleUnion.get(rootId);
    if (unionId && shared.length === 2) {
      out.edge({
        id: `c:${unionId}:${s.id}`, source: unionId, target: s.id, sourceHandle: 'out', targetHandle: 'top', type: 'family',
        data: { centerY: parentY + CARD_H + RAIL + 22 + 9, colorIndex: 0, relationshipType: shared[0].edge?.data?.relationshipType },
      });
    } else {
      for (const p of shared) {
        out.edge({
          id: `c:${p.id}:${s.id}`, source: p.id, target: s.id, sourceHandle: 'bottom', targetHandle: 'top', type: 'family',
          data: { centerY: parentY + CARD_H + RAIL + 31, colorIndex: 1, relationshipType: p.edge?.data?.relationshipType },
        });
      }
    }
  });
  return { nodes: out.nodes, edges: out.edges };
}

export function layoutTree(graph, opts) {
  return graph.view === 'ancestors' ? layoutAncestors(graph, opts) : layoutDescendants(graph, opts);
}

/** Merge a lazily loaded subtree into the current graph. */
export function mergeGraphs(base, extra) {
  const nodes = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of extra.nodes) {
    const existing = nodes.get(n.id);
    nodes.set(n.id, existing
      ? { ...existing, data: { ...existing.data, hasMoreChildren: n.data.hasMoreChildren, childCount: n.data.childCount } }
      : n);
  }
  const edges = new Map(base.edges.map((e) => [e.id, e]));
  for (const e of extra.edges) edges.set(e.id, e);
  return { ...base, nodes: [...nodes.values()], edges: [...edges.values()] };
}
