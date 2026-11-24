// Interactive family tree (React Flow): ancestor/descendant views, depth,
// search, zoom/fit, expand/collapse, lazy loading, clickable cards.
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Info, Maximize, Search, User, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/PersonCard.jsx';
import { Button, ErrorState, Spinner, cx } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { fuzzyDate, lifespan, num, personName, pick } from '../../lib/format.js';
import { SIZES, UNION_COLORS, layoutTree, mergeGraphs } from './layout.js';
import { edgeTypes, nodeTypes } from './nodes.jsx';

const normalize = (s) => (s ?? '').toLowerCase().normalize('NFC').replace(/[্‌‍.]/g, '').replace(/ী/g, 'ি').replace(/ূ/g, 'ু');

function Legend() {
  const { t } = useTranslation();
  const line = (style) => <svg width="28" height="8" aria-hidden><line x1="0" y1="4" x2="28" y2="4" strokeWidth="2.5" {...style} /></svg>;
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-paper/95 p-3 text-xs shadow-sm">
      <div className="flex items-center gap-2">{line({ stroke: '#1f4d3a' })}{t('tree.legend.marriage')}</div>
      <div className="flex items-center gap-2">{line({ stroke: '#b5653a', strokeDasharray: '6 4' })}{t('tree.legend.ended')}</div>
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5">{UNION_COLORS.slice(0, 3).map((c) => <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>
        {t('tree.legend.biological')}
      </div>
      <div className="flex items-center gap-2">{line({ stroke: '#2a6149', strokeDasharray: '6 4' })}{t('tree.legend.adoptive')}</div>
      <div className="flex items-center gap-2">{line({ stroke: '#9b9384', strokeDasharray: '3 3' })}{t('tree.legend.unknownParent')}</div>
    </div>
  );
}

function SelectedPanel({ person, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!person) return null;
  return (
    <div className="absolute bottom-4 left-4 z-10 w-72 rounded-2xl border border-line bg-paper p-4 shadow-xl animate-rise">
      <button type="button" onClick={onClose} className="absolute right-2 top-2 rounded p-1 text-muted hover:bg-paper-200" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-3">
        <Avatar person={person} />
        <div className="min-w-0">
          <div className="font-semibold text-forest-900">{personName(person, lang)}</div>
          <div className="text-sm text-muted">{lifespan(person, lang)}</div>
        </div>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        {person.birth && <div><dt className="inline text-muted">{t('person.born')}: </dt><dd className="inline">{fuzzyDate(person.birth, lang)}</dd></div>}
        {person.death && <div><dt className="inline text-muted">{t('person.died')}: </dt><dd className="inline">{fuzzyDate(person.death, lang)}</dd></div>}
        {person.primary_family && <div><dt className="inline text-muted">{t('person.families')}: </dt><dd className="inline">{pick(person.primary_family, 'name', lang)}</dd></div>}
        {person.redacted && <p className="text-xs text-muted">{t('person.privateNotice')}</p>}
      </dl>
      <div className="mt-3 flex gap-2">
        <Link to={`/people/${person.id}`} className="inline-flex items-center gap-1 rounded-lg bg-forest-700 px-3 py-1.5 text-sm text-paper hover:bg-forest-800"><User className="h-4 w-4" />{t('tree.openProfile')}</Link>
        <Link to={`/people/${person.id}/tree`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-forest-800 hover:bg-forest-50">{t('tree.openTree')}</Link>
      </div>
    </div>
  );
}

function TreeCanvas({ personId, view, setView, depth, setDepth, rootName }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const flow = useReactFlow();
  const [extra, setExtra] = useState(null);         // lazily loaded subtrees merged into the graph
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const treeQuery = useQuery({
    queryKey: ['tree', personId, view, depth],
    queryFn: () => api.get(`/people/${personId}/tree`, { view, depth, includeSpouses: true }),
  });
  useEffect(() => { setExtra(null); setCollapsed(new Set()); setSelected(null); }, [personId, view, depth]);

  const graph = useMemo(() => {
    if (!treeQuery.data) return null;
    return extra ? extra : treeQuery.data;
  }, [treeQuery.data, extra]);

  const people = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n.data.person])), [graph]);

  const onToggle = useCallback((id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const onLoadMore = useCallback(async (id) => {
    if (!graph) return;
    setLoadingMore(true);
    try {
      const sub = await api.get(`/people/${id}/tree`, { view, depth: 3, includeSpouses: true });
      setExtra(mergeGraphs(graph, sub));
    } finally {
      setLoadingMore(false);
    }
  }, [graph, view]);

  const focusNode = useCallback((nodeId) => {
    const node = flow.getNode(nodeId);
    if (!node) return;
    flow.setCenter(node.position.x + SIZES.CARD_W / 2, node.position.y + SIZES.CARD_H / 2, { zoom: 1.1, duration: 600 });
  }, [flow]);

  const layout = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const result = layoutTree(graph, { collapsed });
    const handlers = {
      view,
      onToggle,
      onLoadMore,
      onSelect: (id) => setSelected(id),
      onOpenProfile: (id) => navigate(`/people/${id}`),
      onReroot: (id) => navigate(`/people/${id}/tree?view=${view}`),
      onFocus: (id) => focusNode(id),
    };
    return {
      nodes: result.nodes.map((n) => ({ ...n, data: { ...n.data, ...handlers, highlight: n.id === highlight } })),
      edges: result.edges,
    };
  }, [graph, collapsed, view, highlight, onToggle, onLoadMore, navigate, focusNode]);

  // Re-fit when the tree itself changes (not on highlight).
  useEffect(() => {
    if (!layout.nodes.length) return undefined;
    const id = setTimeout(() => flow.fitView({ padding: 0.15, duration: 400, maxZoom: 1 }), 60);
    return () => clearTimeout(id);
  }, [graph, view, collapsed, flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return layout.nodes.filter((n) => n.type === 'person'
      && (normalize(n.data.person?.full_name_bn).includes(q) || normalize(n.data.person?.full_name_en).includes(q)));
  }, [query, layout.nodes]);

  const goToMatch = (node) => { setHighlight(node.id); focusNode(node.id); };

  if (treeQuery.isLoading) return <Spinner />;
  if (treeQuery.isError) return <div className="p-6"><ErrorState error={treeQuery.error} onRetry={() => treeQuery.refetch()} /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label={t('tree.depth')}>
          {[['ancestors', ArrowUpWideNarrow], ['descendants', ArrowDownWideNarrow]].map(([v, Icon]) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
              className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-forest-700 text-paper' : 'text-forest-800 hover:bg-forest-50')}>
              <Icon className="h-4 w-4" />{t(`tree.${v}`)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('tree.depth')}
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="rounded-lg border border-line bg-white px-2 py-1.5 text-ink">
            {[2, 3, 4, 5, 6, 8, 10].map((d) => <option key={d} value={d}>{num(d, lang)}</option>)}
          </select>
        </label>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) goToMatch(matches[0]); }}
            placeholder={t('tree.search')}
            className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-sm focus:border-forest-500 focus:outline-none"
          />
          {query.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-paper shadow-lg">
              {matches.length === 0 && <div className="px-3 py-2 text-sm text-muted">{t('tree.noMatch')}</div>}
              {matches.slice(0, 12).map((n) => (
                <button key={n.id} type="button" onClick={() => goToMatch(n)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-forest-50">
                  <span>{personName(n.data.person, lang)}</span>
                  <span className="text-xs text-muted">{lifespan(n.data.person, lang)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => flow.fitView({ padding: 0.15, duration: 400 })}><Maximize className="h-4 w-4" />{t('tree.fit')}</Button>
        <Button variant="ghost" size="sm" onClick={() => setShowLegend((s) => !s)} aria-pressed={showLegend}><Info className="h-4 w-4" /></Button>
      </div>

      <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_top,_#f7f1e4,_#efe6d4)]">
        <ReactFlow
          nodes={layout.nodes}
          edges={layout.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesConnectable={false}
          nodesDraggable={false}
          elementsSelectable={false}
          minZoom={0.08}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          proOptions={{ hideAttribution: false }}
          aria-label={t('tree.title', { name: rootName })}
        >
          <Background color="#d9cdb4" gap={28} size={1.2} />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap pannable zoomable position="top-right" maskColor="rgba(250,246,238,0.7)"
            nodeColor={(n) => (n.type === 'union' ? 'transparent' : n.data?.isRoot ? '#c99a2e' : n.data?.person?.sex === 'female' ? '#e7b9a0' : '#a9cddb')}
            className="!hidden !rounded-xl !border !border-line sm:!block" />
        </ReactFlow>
        {showLegend && <div className="absolute left-3 top-3 z-10 hidden sm:block"><Legend /></div>}
        <SelectedPanel person={selected ? people.get(selected) : null} onClose={() => setSelected(null)} />
        {loadingMore && <div className="absolute right-4 top-4 z-10 rounded-lg bg-paper px-3 py-1 text-sm shadow">{t('common.loading')}</div>}
        <p className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 text-xs text-muted md:block">{t('tree.hint')}</p>
      </div>
    </div>
  );
}

export function FamilyTree(props) {
  return (
    <ReactFlowProvider>
      <TreeCanvas {...props} />
    </ReactFlowProvider>
  );
}
