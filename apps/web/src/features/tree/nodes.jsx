// Custom React Flow nodes and edges for the family tree.
import { BaseEdge, Handle, Position, getSmoothStepPath } from '@xyflow/react';
import { BadgeCheck, ChevronDown, ChevronUp, CornerUpRight, GitBranch, Lock, Plus, User } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/PersonCard.jsx';
import { cx } from '../../components/ui.jsx';
import { fuzzyYear, lifespan, ordinal, personName, pick } from '../../lib/format.js';
import { SIZES, UNION_COLORS } from './layout.js';

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };

function SpouseBadge({ info, person }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!info) return null;
  const color = UNION_COLORS[info.colorIndex] ?? '#9b9384';
  const role = info.nth
    ? t(person?.sex === 'female' ? 'person.wifeN' : person?.sex === 'male' ? 'person.husbandN' : 'person.spouseN', { n: ordinal(info.nth, lang) })
    : null;
  const m = info.marriage;
  const parts = [
    role,
    info.unmarried ? t('person.noMarriageRecord') : null,
    m?.startDate ? `${t('person.married')} ${fuzzyYear(m.startDate, lang)}` : null,
    m?.status && m.status !== 'ongoing' ? t(`person.marriageStatus.${m.status}`) : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="absolute -top-3 left-3 flex max-w-[180px] items-center gap-1 truncate rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] text-ink shadow-sm">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{parts.join(' · ')}</span>
    </div>
  );
}

export const PersonNode = memo(({ id, data }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const p = data.person ?? {};
  const deceased = p.living_status === 'deceased';
  return (
    <div
      className={cx(
        'group relative rounded-xl border bg-paper text-left shadow-sm transition-shadow hover:shadow-md',
        data.isRoot ? 'border-turmeric-500 ring-2 ring-turmeric-500/40' : 'border-line',
        data.highlight && 'ring-4 ring-river-600/50',
      )}
      style={{ width: SIZES.CARD_W, height: SIZES.CARD_H }}
    >
      <Handle type="target" position={Position.Top} id="top" style={hidden} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hidden} />
      <Handle type="target" position={Position.Bottom} id="bottom-in" style={hidden} />
      <SpouseBadge info={data.spouseInfo} person={p} />

      <button type="button" onClick={() => data.onSelect?.(data.personId)} className="flex h-full w-full items-start gap-2.5 p-3 pt-3.5 text-left">
        <Avatar person={p} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={cx('line-clamp-2 text-[15px] font-semibold leading-snug text-forest-900', deceased && 'text-forest-950')}>
              {personName(p, lang)}
            </span>
            {p.verification_status === 'verified' && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-forest-600" aria-label={t('person.verified')} />}
            {p.redacted && <Lock className="h-3 w-3 shrink-0 text-muted" />}
          </div>
          <div className="truncate text-xs text-muted">{lifespan(p, lang) || ' '}</div>
          <div className="truncate text-[11px] text-forest-600">{pick(p.primary_family, 'name', lang)}</div>
        </div>
      </button>

      <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
        <button type="button" title={t('tree.openProfile')} aria-label={t('tree.openProfile')} onClick={() => data.onOpenProfile?.(data.personId)} className="rounded p-1 text-forest-700 hover:bg-forest-50">
          <User className="h-3.5 w-3.5" />
        </button>
        {!data.isRoot && (
          <button type="button" title={t('tree.openTree')} aria-label={t('tree.openTree')} onClick={() => data.onReroot?.(data.personId)} className="rounded p-1 text-forest-700 hover:bg-forest-50">
            <GitBranch className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {data.canCollapse && (
        <button
          type="button"
          onClick={() => data.onToggle?.(data.personId)}
          title={data.collapsed ? t('tree.expand') : t('tree.collapse')}
          className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-paper px-1.5 text-[10px] text-forest-700 shadow-sm hover:bg-forest-50"
        >
          {data.view === 'ancestors'
            ? (data.collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
            : (data.collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
          {data.collapsed && data.hiddenCount > 0 && <span>{t('tree.hiddenChildren', { count: data.hiddenCount })}</span>}
        </button>
      )}
      {((data.view !== 'ancestors' && data.hasMoreChildren) || (data.view === 'ancestors' && data.hasMoreParents)) && !data.collapsed && (
        <button
          type="button"
          onClick={() => data.onLoadMore?.(data.personId)}
          className={cx('absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-turmeric-500 px-2 py-0.5 text-[11px] font-medium text-forest-950 shadow hover:bg-turmeric-600',
            data.view === 'ancestors' ? '-top-3' : '-bottom-3')}
        >
          <Plus className="h-3 w-3" /> {t('tree.loadMore')}
        </button>
      )}
    </div>
  );
});

export const PersonRefNode = memo(({ data }) => {
  const { t, i18n } = useTranslation();
  return (
    <div className="relative flex items-center gap-2 rounded-xl border border-dashed border-forest-300 bg-forest-50/70 px-3 text-left" style={{ width: SIZES.CARD_W, height: SIZES.CARD_H * 0.7, marginTop: SIZES.CARD_H * 0.15 }}>
      <Handle type="target" position={Position.Top} id="top" style={hidden} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={hidden} />
      <Handle type="target" position={Position.Bottom} id="bottom-in" style={hidden} />
      <CornerUpRight className="h-4 w-4 shrink-0 text-forest-600" />
      <button type="button" onClick={() => data.onFocus?.(data.personId)} className="min-w-0 text-left">
        <div className="truncate text-sm font-medium text-forest-900">{personName(data.person, i18n.language)}</div>
        <div className="text-[11px] text-muted">{t('tree.seeAbove')}</div>
      </button>
    </div>
  );
});

export const UnionNode = memo(({ data }) => (
  <div
    className="rounded-full border-2 border-paper shadow"
    style={{ width: SIZES.DOT, height: SIZES.DOT, background: data.unknown ? '#9b9384' : UNION_COLORS[data.colorIndex] ?? '#2a6149' }}
  >
    <Handle type="target" position={Position.Top} id="in" style={hidden} />
    <Handle type="source" position={Position.Bottom} id="out" style={hidden} />
  </div>
));

const MARRIAGE_STYLE = {
  ongoing: { stroke: '#1f4d3a' },
  unknown: { stroke: '#1f4d3a' },
  widowed: { stroke: '#7d7466' },
  separated: { stroke: '#b5653a', strokeDasharray: '6 4' },
  divorced: { stroke: '#b5653a', strokeDasharray: '6 4' },
  annulled: { stroke: '#b5653a', strokeDasharray: '2 4' },
};

/** Spouse link: down from both partners to that marriage's own rail. */
export function MarriageEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const railY = data?.railY ?? Math.max(sourceY, targetY) + 16;
  const r = 6;
  const dir = targetX >= sourceX ? 1 : -1;
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${railY - r} Q ${sourceX} ${railY} ${sourceX + r * dir} ${railY}
    L ${targetX - r * dir} ${railY} Q ${targetX} ${railY} ${targetX} ${railY - r} L ${targetX} ${targetY}`;
  const style = data?.unmarried ? { stroke: '#9b9384', strokeDasharray: '2 4' } : MARRIAGE_STYLE[data?.status] ?? MARRIAGE_STYLE.ongoing;
  return <BaseEdge id={id} path={path} style={{ strokeWidth: 2.25, fill: 'none', ...style }} />;
}

/** Parent → child link, coloured per marriage; adoption/foster dashed. */
export function FamilyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const [path] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, centerY: data?.centerY,
  });
  const color = data?.colorIndex >= 0 ? UNION_COLORS[data.colorIndex] : '#9b9384';
  const dashed = data?.relationshipType && data.relationshipType !== 'biological';
  return <BaseEdge id={id} path={path} style={{ stroke: color, strokeWidth: 1.75, strokeDasharray: dashed ? '6 4' : undefined }} />;
}

export const nodeTypes = { person: PersonNode, personRef: PersonRefNode, union: UnionNode };
export const edgeTypes = { marriage: MarriageEdge, family: FamilyEdge };
