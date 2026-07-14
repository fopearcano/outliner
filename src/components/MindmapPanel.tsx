// A floating, movable mindmap of the current document's outline. Opened from
// View → "Mindmap from outline". It lays the tree out left-to-right (the doc at
// the far left, branches fanning to the right), updates live as you edit, and
// lets you pan (drag the canvas), zoom (wheel) and jump to a bullet (click a
// node). Drag the title bar to move the whole panel; drag its corner to resize.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { plainText } from '../lib/markdown';
import { COLOR_HEX } from '../types';

const ROOT = '__mm_root__';
const NODE_W = 168;
const NODE_H = 30;
const X_GAP = 210; // horizontal distance between depth levels
const Y_GAP = 12; // vertical gap between sibling leaves

interface MNode {
  id: string;
  x: number;
  y: number;
  depth: number;
  text: string;
  color: string | null;
  collapsed: boolean;
}

export default function MindmapPanel() {
  const currentDocId = useStore((s) => s.currentDocId);
  const docs = useStore((s) => s.docs);
  const items = useStore((s) => s.items);

  const doc = currentDocId ? docs[currentDocId] : null;
  const rootId = doc?.rootItemId;

  // ---- layout (recomputed on every store change → live) --------------------
  const nodes: MNode[] = [];
  const edges: [string, string][] = [];
  {
    let cursorY = 0;
    const place = (id: string, depth: number): number => {
      const isRoot = id === ROOT;
      const it = isRoot ? null : items[id];
      const kidsSrc = isRoot ? (rootId ? items[rootId]?.children ?? [] : []) : it!.collapsed ? [] : it!.children;
      const kids = kidsSrc.filter((c) => items[c]);
      let y: number;
      if (kids.length === 0) {
        y = cursorY;
        cursorY += NODE_H + Y_GAP;
      } else {
        const ys = kids.map((k) => {
          const cy = place(k, depth + 1);
          edges.push([id, k]);
          return cy;
        });
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      nodes.push({
        id,
        x: depth * X_GAP,
        y,
        depth,
        text: isRoot ? doc?.title || 'Document' : plainText(it!.text) || 'Untitled',
        color: isRoot ? null : it!.color ? COLOR_HEX[it!.color] : null,
        collapsed: !isRoot && !!it!.collapsed && it!.children.length > 0,
      });
      return y;
    };
    if (rootId) place(ROOT, 0);
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const contentW = Math.max(NODE_W, ...nodes.map((n) => n.x + NODE_W)) + 20;
  const contentH = Math.max(NODE_H, ...nodes.map((n) => n.y + NODE_H)) + 20;

  // ---- floating-panel position + drag --------------------------------------
  const [pos, setPos] = useState({ x: Math.max(60, window.innerWidth - 720), y: 96 });
  const panelRef = useRef<HTMLDivElement>(null);
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

  // ---- canvas pan + zoom ---------------------------------------------------
  const bodyRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ tx: 20, ty: 20, k: 1 });
  const panning = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fit = () => {
    const b = bodyRef.current;
    if (!b) return;
    const k = Math.min((b.clientWidth - 24) / contentW, (b.clientHeight - 24) / contentH, 1.1);
    const kk = Math.max(0.15, k || 1);
    setView({ k: kk, tx: 12, ty: Math.max(12, (b.clientHeight - contentH * kk) / 2) });
  };
  // Fit once when the panel opens (not on every edit, so pan/zoom is preserved).
  const didFit = useRef(false);
  useLayoutEffect(() => {
    if (!didFit.current && nodes.length) {
      didFit.current = true;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  const onCanvasDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.mm-node')) return; // node handles its own click
    panning.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    if (!panning.current) return;
    setView((v) => ({ ...v, tx: panning.current!.tx + (e.clientX - panning.current!.x), ty: panning.current!.ty + (e.clientY - panning.current!.y) }));
  };
  const endCanvas = (e: React.PointerEvent) => {
    panning.current = null;
    (e.currentTarget as HTMLElement).style.cursor = '';
  };
  // Zoom on wheel — native non-passive listener so we can preventDefault and
  // keep the outline behind the panel from scrolling while zooming.
  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = b.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        const k2 = Math.min(2.6, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        // keep the point under the cursor fixed while zooming
        const tx = mx - ((mx - v.tx) * k2) / v.k;
        const ty = my - ((my - v.ty) * k2) / v.k;
        return { tx, ty, k: k2 };
      });
    };
    b.addEventListener('wheel', handler, { passive: false });
    return () => b.removeEventListener('wheel', handler);
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useStore.getState().setPreferences({ mindmapOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="mindmap-panel" ref={panelRef} style={{ left: pos.x, top: pos.y }}>
      <div
        className="mm-head"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={endHeader}
        onPointerCancel={endHeader}
      >
        <span className="mm-title">🧠 Mindmap · {doc?.title || 'Document'}</span>
        <span className="mm-actions">
          <button className="mm-btn" title="Fit to view" onClick={fit}>
            ⤢ Fit
          </button>
          <button
            className="mm-btn"
            title="Close mindmap"
            onClick={() => useStore.getState().setPreferences({ mindmapOpen: false })}
          >
            ✕
          </button>
        </span>
      </div>
      <div
        className="mm-body"
        ref={bodyRef}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={endCanvas}
        onPointerCancel={endCanvas}
      >
        {nodes.length === 0 ? (
          <div className="mm-empty">This document has no bullets yet.</div>
        ) : (
          <svg className="mm-svg" width="100%" height="100%">
            <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
              {edges.map(([from, to]) => {
                const a = nodeById.get(from)!;
                const b = nodeById.get(to)!;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={to}
                    className="mm-edge"
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                  />
                );
              })}
              {nodes.map((n) => (
                <g
                  key={n.id}
                  className={'mm-node' + (n.depth === 0 ? ' root' : '') + (n.collapsed ? ' collapsed' : '')}
                  transform={`translate(${n.x},${n.y})`}
                  onClick={() => n.id !== ROOT && useStore.getState().revealItem(n.id)}
                >
                  <rect
                    className="mm-rect"
                    width={NODE_W}
                    height={NODE_H}
                    rx={7}
                    style={n.color ? { stroke: n.color } : undefined}
                  />
                  {n.color && <rect className="mm-tab" width={4} height={NODE_H} rx={2} style={{ fill: n.color }} />}
                  <foreignObject x={8} y={0} width={NODE_W - 16} height={NODE_H}>
                    <div className="mm-label">{n.text}</div>
                  </foreignObject>
                  {n.collapsed && <circle className="mm-more" cx={NODE_W} cy={NODE_H / 2} r={4} />}
                </g>
              ))}
            </g>
          </svg>
        )}
        <div className="mm-hint">drag to pan · scroll to zoom · click a node to jump</div>
      </div>
    </div>
  );
}
