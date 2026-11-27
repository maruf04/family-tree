import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Clock, MapPin, Phone, UserRound } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, Input, PageHeader, QueryState, Tabs, cx } from '../components/ui.jsx';
import { AddContentButton } from '../features/content/AddContent.jsx';
import { api } from '../lib/api.js';
import { fuzzyDate, personName, pick } from '../lib/format.js';

const COLORS = { mosque: '#1f4d3a', temple: '#b5653a', school: '#2f6f86', market: '#c99a2e', homestead: '#964f2a', pond: '#2f6f86', river: '#2f6f86', graveyard: '#6b665c', health: '#b03a3a', field: '#3d7a5d' };
const pin = (type) => L.divIcon({
  className: '', iconSize: [26, 34], iconAnchor: [13, 34], popupAnchor: [0, -30],
  html: `<svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 0C6 0 0 5.6 0 12.6 0 22 13 34 13 34s13-12 13-21.4C26 5.6 20 0 13 0z" fill="${COLORS[type] ?? '#1f4d3a'}" stroke="#faf6ee" stroke-width="1.5"/><circle cx="13" cy="12.5" r="4.5" fill="#faf6ee"/></svg>`,
});

function VillageMap() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [type, setType] = useState('');
  const query = useQuery({ queryKey: ['places'], queryFn: () => api.get('/directory/places', { limit: 100 }) });
  const bounds = useMemo(() => {
    const pts = (query.data?.items ?? []).filter((p) => p.latitude != null).map((p) => [p.latitude, p.longitude]);
    return pts.length ? L.latLngBounds(pts).pad(0.25) : null;
  }, [query.data]);
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
      {({ items }) => {
        const types = [...new Set(items.map((p) => p.place_type))];
        const shown = items.filter((p) => !type || p.place_type === type);
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {['', ...types].map((v) => <button key={v} type="button" aria-pressed={type === v} onClick={() => setType(v)} className={cx('rounded-full border px-3 py-1 text-sm', type === v ? 'border-forest-700 bg-forest-700 text-paper' : 'border-line bg-white/70 hover:border-forest-300')}>{v ? t(`directory.placeTypes.${v}`) : t('common.all')}</button>)}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {bounds && (
                <MapContainer bounds={bounds} scrollWheelZoom={false} className="isolate h-[480px] rounded-2xl border border-line lg:col-span-2">
                  <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
                  {shown.filter((p) => p.latitude != null).map((p) => (
                    <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pin(p.place_type)} title={pick(p, 'name', lang)}>
                      <Popup><strong>{pick(p, 'name', lang)}</strong><br />{t(`directory.placeTypes.${p.place_type}`)}{p.family_id && <><br /><Link to={`/families/${p.family_id}`}>{pick(p, 'family_name', lang)}</Link></>}</Popup>
                    </Marker>
                  ))}
                </MapContainer>
              )}
              <ul className="space-y-2">
                {shown.map((p) => <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-white/70 px-3 py-2"><MapPin className="h-4 w-4 shrink-0" style={{ color: COLORS[p.place_type] ?? '#1f4d3a' }} /><span className="flex-1">{pick(p, 'name', lang)}</span><span className="text-xs text-muted">{t(`directory.placeTypes.${p.place_type}`)}</span></li>)}
              </ul>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

function Institutions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['institutions'], queryFn: () => api.get('/directory/institutions', { limit: 100 }) });
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
      {({ items }) => (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <Card key={i.id} className="p-5">
              <Badge tone="river">{t(`directory.institutionTypes.${i.institution_type}`)}</Badge>
              <h2 className="mt-2 text-lg font-semibold">{pick(i, 'name', lang)}</h2>
              {i.established && <p className="text-sm text-muted">{t('directory.established')}: {fuzzyDate(i.established, lang)}</p>}
              {i.head_name && <p className="text-sm text-muted">{t('directory.head')}: {i.head_name}</p>}
              <p className="mt-1">{pick(i, 'description', lang)}</p>
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function Businesses() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const query = useQuery({ queryKey: ['businesses'], queryFn: () => api.get('/directory/businesses', { limit: 100 }) });
  return (
    <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
      {({ items }) => (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.filter((b) => b.is_active).map((b) => (
            <Card key={b.id} className="space-y-1 p-5">
              <Badge tone="gold">{t(`directory.businessTypes.${b.business_type}`)}</Badge>
              <h2 className="text-lg font-semibold">{pick(b, 'name', lang)}</h2>
              <p>{pick(b, 'description', lang)}</p>
              {b.owner && <p className="flex items-center gap-2 text-sm text-muted"><UserRound className="h-4 w-4" /><Link className="hover:underline" to={`/people/${b.owner.id}`}>{personName(b.owner, lang)}</Link></p>}
              {b.opening_hours && <p className="flex items-center gap-2 text-sm text-muted"><Clock className="h-4 w-4" />{b.opening_hours}</p>}
              {b.contact_phone && <p className="flex items-center gap-2 text-sm text-muted"><Phone className="h-4 w-4" />{b.contact_phone}</p>}
            </Card>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function Residents() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [text, setText] = useState('');
  const q = useDeferredValue(text.trim());
  const query = useQuery({ queryKey: ['residents', q], queryFn: () => api.get('/directory/residents', { q, limit: 100 }) });
  return (
    <div className="space-y-4">
      <div className="max-w-md"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('directory.searchResidents')} aria-label={t('directory.searchResidents')} /></div>
      <QueryState query={query} isEmpty={(d) => d.items.length === 0}>
        {({ items }) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => (
              <Card key={r.id} className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-100 font-display text-forest-800">{[...(pick(r, 'display_name', lang) || '?')][0]}</span>
                <div><div className="font-medium">{r.person_id ? <Link className="hover:underline" to={`/people/${r.person_id}`}>{pick(r, 'display_name', lang)}</Link> : pick(r, 'display_name', lang)}</div><div className="text-sm text-muted">{r.family ? pick(r.family, 'name', lang) : t(`admin.roles.${r.role}`)}</div></div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

export default function Directory() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'map';
  return (
    <>
      <PageHeader title={t('directory.title')} subtitle={t('directory.subtitle')} actions={tab === 'businesses' ? <AddContentButton kind="business" /> : null}>
        <Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={['map', 'institutions', 'businesses', 'residents'].map((v) => ({ value: v, label: t(`directory.tabs.${v}`) }))} />
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {tab === 'map' && <VillageMap />}
        {tab === 'institutions' && <Institutions />}
        {tab === 'businesses' && <Businesses />}
        {tab === 'residents' && <Residents />}
      </div>
    </>
  );
}
