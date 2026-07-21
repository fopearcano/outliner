// A floating, movable "analytical map" — an Obsidian-style force-directed graph
// of the outline's connections: bullets, #tags, @mentions and documents, wired
// by [[internal links]], tag membership and document grouping. Hover a node to
// highlight its neighbours, drag nodes around, pan/zoom the canvas, and click a
// node to jump to it (bullet), search it (tag) or open it (document). Opened
// from View → "Analytical map". Updates live as you edit.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useUi } from './ui-context';
import { buildGraph, type GNode, type GEdge } from '../lib/graph';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
}

const REPULSION = 2600;
const AL_MIN = 0.04;
const AL_DECAY = 0.98;

function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function radius(n: GNode): number {
  const base = n.type === 'doc' ? 8 : n.type === 'bullet' ? 4.5 : 6;
  return base + Math.min(13, Math.sqrt(n.degree) * 2.1);
}
function nodeFill(n: GNode): string {
  if (n.type === 'tag') return 'var(--tok-blue)';
  if (n.type === 'mention') return 'var(--tok-yellow)';
  if (n.type === 'doc') return 'var(--tok-purple)';
  if (n.color) return n.color;
  return `hsl(${hueFor(n.docId || 'x')}, 42%, 56%)`;
}

export default function AnalyticalMap() {
  const items = useStore((s) => s.items);
  const docs = useStore((s) => s.docs);
  const currentDocId = useStore((s) => s.currentDocId);
  const ui = useUi();

  const [opts, setOpts] = useState({ tags: true, docs: false, orphans: false, allDocs: true });
  const scopeDocId = opts.allDocs ? null : currentDocId;

  const graph = useMemo(
    () => buildGraph(items, docs, { tags: opts.tags, docs: opts.docs, orphans: opts.orphans, scopeDocId }),
    [items, docs, opts.tags, opts.docs, opts.orphans, scopeDocId],
  );
  const { nodes, edges } = graph;

  // Adjacency for hover highlighting.
  const adj = useMemo(() => {
    const a = new Map<string, Set<string>>();
    for (const e of edges) {
      (a.get(e.source) ?? a.set(e.source, new Set()).get(e.source)!).add(e.target);
      (a.get(e.target) ?? a.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    return a;
  }, [edges]);

  // ---- force simulation (positions kept in a ref, ticked via RAF) ----------
  const posRef = useRef<Map<string, P>>(new Map());
  const edgesRef = useRef<GEdge[]>(edges);
  edgesRef.current = edges;
  const alphaRef = useRef(0);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const edgeEls = useRef<(SVGLineElement | null)[]>([]);
  const [, tickRender] = useReducer((x) => x + 1, 0);

  // Structural signature — reheat only when the node set / edge count changes,
  // not on every keystroke (so text edits don't make the graph jiggle).
  const signature = useMemo(
    () => nodes.map((n) => n.id).sort().join('|') + '#' + edges.length,
    [nodes, edges.length],
  );

  const tick = () => {
    const m = posRef.current;
    const a = alphaRef.current;
    const arr = [...m.values()];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const p = arr[i];
        const q = arr[j];
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > 90000) continue; // ignore far pairs (local repulsion)
        if (d2 < 25) d2 = 25;
        const d = Math.sqrt(d2);
        const f = ((REPULSION / d2) * a);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        p.vx += fx;
        p.vy += fy;
        q.vx -= fx;
        q.vy -= fy;
      }
    }
    for (const e of edgesRef.current) {
      const p = m.get(e.source);
      const q = m.get(e.target);
      if (!p || !q) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = e.kind === 'doc' ? 120 : e.kind === 'tag' ? 74 : 84;
      const f = (d - rest) * 0.02 * a;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      p.vx += fx;
      p.vy += fy;
      q.vx -= fx;
      q.vy -= fy;
    }
    for (const p of m.values()) {
      p.vx += -p.x * 0.012 * a;
      p.vy += -p.y * 0.012 * a;
      p.vx *= 0.82;
      p.vy *= 0.82;
      if (p.fx != null) {
        p.x = p.fx;
        p.y = p.fy as number;
        p.vx = 0;
        p.vy = 0;
      } else {
        p.x += p.vx;
        p.y += p.vy;
      }
    }
    alphaRef.current = a * AL_DECAY;
  };

  // Animate imperatively: the RAF loop writes positions straight to the SVG
  // attributes (no React reconciliation per frame — that would storm at scale).
  const paint = () => {
    const m = posRef.current;
    for (const [id, el] of nodeEls.current) {
      const p = m.get(id);
      if (p && el) el.setAttribute('transform', `translate(${p.x},${p.y})`);
    }
    const es = edgesRef.current;
    for (let i = 0; i < es.length; i++) {
      const el = edgeEls.current[i];
      if (!el) continue;
      const p = m.get(es[i].source);
      const q = m.get(es[i].target);
      if (!p || !q) continue;
      el.setAttribute('x1', String(p.x));
      el.setAttribute('y1', String(p.y));
      el.setAttribute('x2', String(q.x));
      el.setAttribute('y2', String(q.y));
    }
  };

  const runLoop = () => {
    cancelAnimationFrame(rafRef.current);
    runningRef.current = true;
    const step = () => {
      tick();
      paint();
      if (alphaRef.current > AL_MIN) rafRef.current = requestAnimationFrame(step);
      else runningRef.current = false;
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Sync sim node set when the graph structure changes, then reheat.
  useEffect(() => {
    const m = posRef.current;
    const ids = new Set(nodes.map((n) => n.id));
    for (const id of [...m.keys()]) if (!ids.has(id)) m.delete(id);
    // Seed new nodes around the centroid of the existing ones (so freshly added
    // nodes appear near the graph, not ever-farther away over the session).
    let cx = 0, cy = 0, cn = 0;
    for (const p of m.values()) {
      cx += p.x;
      cy += p.y;
      cn++;
    }
    if (cn) {
      cx /= cn;
      cy /= cn;
    }
    let k = 0;
    for (const n of nodes) {
      if (!m.has(n.id)) {
        const ang = k * 2.399963229;
        const r = 22 * Math.sqrt(k + 1);
        m.set(n.id, { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, vx: 0, vy: 0 });
        k++;
      }
    }
    alphaRef.current = 1;
    tickRender(); // materialize new/removed SVG elements, then animate imperatively
    runLoop();
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ---- floating panel: position + drag by header ---------------------------
  const [pos, setPos] = useState({ x: Math.max(60, window.innerWidth - 760), y: 84 });
  const dragPanel = useRef<{ dx: number; dy: number } | null>(null);
  const onHeaderDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragPanel.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderMove = (e: React.PointerEvent) => {
    if (!dragPanel.current) return;
    setPos({ x: e.clientX - dragPanel.current.dx, y: Math.max(0, e.clientY - dragPanel.current.dy) });
  };
  const endHeader = () => (dragPanel.current = null);

  // ---- canvas pan / zoom / node drag ---------------------------------------
  const bodyRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ tx: 300, ty: 220, k: 1 });
  const panning = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const toGraph = (clientX: number, clientY: number) => {
    const r = bodyRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - view.tx) / view.k, y: (clientY - r.top - view.ty) / view.k };
  };

  const fit = () => {
    const b = bodyRef.current;
    if (!b || !posRef.current.size) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of posRef.current.values()) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const k = Math.min((b.clientWidth - 80) / w, (b.clientHeight - 80) / h, 1.6);
    const kk = Math.max(0.1, k);
    setView({ k: kk, tx: b.clientWidth / 2 - ((minX + maxX) / 2) * kk, ty: b.clientHeight / 2 - ((minY + maxY) / 2) * kk });
  };
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const t = setTimeout(() => {
      if (posRef.current.size) {
        didFit.current = true;
        fit();
      }
    }, 700); // let the sim settle a bit, then frame it
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const onDown = (e: React.PointerEvent) => {
    const nodeEl = (e.target as HTMLElement).closest('.g-node') as HTMLElement | null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (nodeEl?.dataset.id) {
      // Don't pin/reheat yet — wait to see if this is a click or a drag.
      drag.current = { id: nodeEl.dataset.id, sx: e.clientX, sy: e.clientY, moved: false };
    } else {
      panning.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) d.moved = true;
      if (d.moved) {
        const p = posRef.current.get(d.id);
        if (p) {
          const g = toGraph(e.clientX, e.clientY);
          p.fx = g.x;
          p.fy = g.y;
        }
        // keep the sim warm so the node tracks the cursor (even after it cooled)
        alphaRef.current = Math.max(alphaRef.current, 0.25);
        if (!runningRef.current) runLoop();
      }
      return;
    }
    if (panning.current) {
      setView((v) => ({ ...v, tx: panning.current!.tx + (e.clientX - panning.current!.x), ty: panning.current!.ty + (e.clientY - panning.current!.y) }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      if (d.moved) {
        const p = posRef.current.get(d.id);
        if (p) {
          p.fx = null;
          p.fy = null;
        }
        alphaRef.current = Math.max(alphaRef.current, 0.2);
        if (!runningRef.current) runLoop();
      } else {
        fireNode(d.id); // a click, not a drag
      }
      drag.current = null;
    }
    panning.current = null;
    (e.currentTarget as HTMLElement).style.cursor = '';
  };

  const fireNode = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.type === 'bullet') useStore.getState().revealItem(n.ref);
    else if (n.type === 'doc') useStore.getState().selectDoc(id.slice(2));
    else ui.onTag(n.label);
  };

  // wheel zoom (native, non-passive)
  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const r = b.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const k2 = Math.min(3, Math.max(0.1, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return { tx: mx - ((mx - v.tx) * k2) / v.k, ty: my - ((my - v.ty) * k2) / v.k, k: k2 };
      });
    };
    b.addEventListener('wheel', handler, { passive: false });
    return () => b.removeEventListener('wheel', handler);
  }, []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setPreferences({ graphOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const neighbors = hover ? adj.get(hover) : null;
  const dim = (id: string) => hover != null && id !== hover && !(neighbors && neighbors.has(id));

  const Toggle = ({ on, set, children }: { on: boolean; set: () => void; children: React.ReactNode }) => (
    <button className={'graph-chip' + (on ? ' on' : '')} onClick={set}>
      {children}
    </button>
  );

  return (
    <div className="graph-panel" style={{ left: pos.x, top: pos.y }}>
      <div className="graph-head" onPointerDown={onHeaderDown} onPointerMove={onHeaderMove} onPointerUp={endHeader} onPointerCancel={endHeader}>
        <span className="graph-title">🕸 Analytical map</span>
        <span className="graph-actions">
          <button className="graph-btn" title="Fit to view" onClick={() => fit()}>
            ⤢ Fit
          </button>
          <button className="graph-btn" title="Close" onClick={() => useStore.getState().setPreferences({ graphOpen: false })}>
            ✕
          </button>
        </span>
      </div>

      <div className="graph-toolbar">
        <Toggle on={opts.tags} set={() => setOpts((o) => ({ ...o, tags: !o.tags }))}>#tags</Toggle>
        <Toggle on={opts.docs} set={() => setOpts((o) => ({ ...o, docs: !o.docs }))}>docs</Toggle>
        <Toggle on={opts.orphans} set={() => setOpts((o) => ({ ...o, orphans: !o.orphans }))}>orphans</Toggle>
        <Toggle on={opts.allDocs} set={() => setOpts((o) => ({ ...o, allDocs: !o.allDocs }))}>all documents</Toggle>
        <span className="graph-count">
          {nodes.length} nodes · {edges.length} links
          {graph.truncated ? ` · +${graph.truncated} hidden` : ''}
        </span>
      </div>

      <div className="graph-body" ref={bodyRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {nodes.length === 0 ? (
          <div className="graph-empty">
            No connections yet. Link bullets with <code>[[…]]</code> or add <code>#tags</code> / <code>@mentions</code>.
          </div>
        ) : (
          <svg className="graph-svg" width="100%" height="100%">
            <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
              {edges.map((e, i) => {
                const p = posRef.current.get(e.source);
                const q = posRef.current.get(e.target);
                if (!p || !q) return null;
                const lit = hover != null && (e.source === hover || e.target === hover);
                const faded = hover != null && !lit;
                return (
                  <line
                    key={i}
                    ref={(el) => {
                      edgeEls.current[i] = el;
                    }}
                    className={'g-edge ' + e.kind + (lit ? ' lit' : '') + (faded ? ' faded' : '')}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                  />
                );
              })}
              {nodes.map((n) => {
                const p = posRef.current.get(n.id);
                if (!p) return null;
                const r = radius(n);
                const showLabel =
                  n.type !== 'bullet' || n.id === hover || (neighbors?.has(n.id) ?? false) || n.degree >= 4 || view.k > 1.35;
                return (
                  <g
                    key={n.id}
                    ref={(el) => {
                      if (el) nodeEls.current.set(n.id, el);
                      else nodeEls.current.delete(n.id);
                    }}
                    className={'g-node ' + n.type + (dim(n.id) ? ' dim' : '') + (n.id === hover ? ' hot' : '')}
                    data-id={n.id}
                    transform={`translate(${p.x},${p.y})`}
                    onPointerEnter={() => setHover(n.id)}
                    onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  >
                    <circle className="g-dot" r={r} style={{ fill: nodeFill(n) }} />
                    {showLabel && (
                      <text className="g-label" x={r + 3} y={4}>
                        {n.type === 'bullet' && n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        <div className="graph-hint">drag nodes · drag bg to pan · scroll to zoom · click to open</div>
      </div>
    </div>
  );
}
