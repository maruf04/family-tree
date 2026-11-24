// Readable view of a proposal's changes: field by field, old → new.
import { useQueries } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { fuzzyDate, personName, pick } from '../../lib/format.js';

const UUID = /^[0-9a-f-]{36}$/i;
const PERSON_FIELDS = ['parent_id', 'child_id', 'spouse1_id', 'spouse2_id', 'person_id', 'root_person_id', 'informant_person_id'];
const LABELS = {
  full_name: 'common.name', nickname: 'person.nickname', occupation: 'person.occupation', birth_place: 'person.birthPlace', death_place: 'person.deathPlace',
  burial_place: 'person.burialPlace', biography: 'person.biography', birth: 'person.born', death: 'person.died', living_status: 'common.status',
  parent_id: 'person.parents', child_id: 'editor.child', spouse1_id: 'person.spouses', spouse2_id: 'person.spouses', person_id: 'proposals.entity.person',
  relationship_type: 'editor.relationshipType', status: 'editor.marriageStatus', start_date: 'editor.marriageStart', end_date: 'editor.marriageEnd', spouse1_order: 'editor.order',
  family_id: 'proposals.entity.family', sex: 'person.sexLabel', membership_type: 'editor.membershipType', privacy_level: 'editor.privacy',
};

export function ProposalItems({ items }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const ids = [...new Set(items.flatMap((item) => {
    const data = { ...item.base_snapshot, ...item.payload };
    return [item.entity_type === 'person' ? item.target_id : null, ...PERSON_FIELDS.map((f) => data[f])];
  }).filter((v) => typeof v === 'string' && UUID.test(v)))];
  const people = useQueries({ queries: ids.map((id) => ({ queryKey: ['person', id], queryFn: () => api.get(`/people/${id}`), retry: false })) });
  const names = new Map(people.map((q, i) => [ids[i], q.data ? personName(q.data.person, lang) : null]));
  const familyIds = [...new Set(items.map((i) => ({ ...i.base_snapshot, ...i.payload }).family_id).filter((v) => typeof v === 'string' && UUID.test(v)))];
  const families = useQueries({ queries: familyIds.map((id) => ({ queryKey: ['family', id], queryFn: () => api.get(`/families/${id}`), retry: false })) });
  const familyNames = new Map(families.map((q, i) => [familyIds[i], q.data ? pick(q.data, 'name', lang) : null]));
  const created = new Map(items.filter((i) => i.temp_ref).map((i) => [`$${i.temp_ref}`, personName(i.payload, lang)]));

  const label = (field) => {
    const m = field.match(/^(.*)_(bn|en)$/);
    const key = m ? m[1] : field;
    const text = key === 'full_name' ? t(m[2] === 'bn' ? 'common.nameBn' : 'common.nameEn') : LABELS[key] ? t(LABELS[key]) : field;
    return m && key !== 'full_name' ? `${text} (${m[2] === 'bn' ? 'বাংলা' : 'English'})` : text;
  };
  const show = (field, v) => {
    if (v == null || v === '') return <span className="text-muted">—</span>;
    if (typeof v === 'object') return fuzzyDate(v, lang) || '—';
    if (familyNames.get(v)) return <Link className="text-forest-700 underline" to={`/families/${v}`}>{familyNames.get(v)}</Link>;
    if (created.has(v)) return <strong>{created.get(v)}</strong>;
    if (names.get(v)) return <Link className="text-forest-700 underline" to={`/people/${v}`}>{names.get(v)}</Link>;
    for (const group of ['person.sex', 'person.living', 'person.marriageStatus', 'editor', 'families.membership']) {
      if (['sex', 'living_status', 'status', 'relationship_type', 'membership_type'].includes(field) && i18n.exists(`${group}.${v}`)) return t(`${group}.${v}`);
    }
    return String(v);
  };

  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const identity = item.action === 'delete' ? PERSON_FIELDS.filter((f) => item.base_snapshot?.[f]) : [];
        const fields = item.action === 'delete' ? identity : Object.keys(item.payload).filter((f) => f !== 'is_primary');
        return (
          <li key={item.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.action === 'delete' ? 'clay' : item.action === 'create' ? 'green' : 'gold'}>{t(`proposals.action.${item.action}`)}</Badge>
                <strong>{t(`proposals.entity.${item.entity_type}`)}</strong>
                {item.entity_type === 'person' && item.target_id && show('person_id', item.target_id)}
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
                {fields.map((f) => (
                  <div key={f} className="contents">
                    <dt className="text-muted">{label(f)}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {item.action === 'update' && <><span className="text-muted line-through">{show(f, item.base_snapshot?.[f])}</span><ArrowRight className="h-3 w-3" aria-hidden /></>}
                      {show(f, item.action === 'delete' ? item.base_snapshot?.[f] : item.payload[f])}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
