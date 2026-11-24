// Genealogy editing. Every action is expressed as a list of change items.
// Members send them as a proposal for review; moderators apply them at once
// (atomically). Modes: edit | addChild | addSpouse | addParent | editMarriage | remove
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { FuzzyDateInput, cleanFuzzyDate } from '../../components/FuzzyDateInput.jsx';
import { Button, Field, InlineError, Input, Modal, Select, Textarea } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { lifespan, num, ordinal, personName, pick } from '../../lib/format.js';
import { PersonPicker } from './PersonPicker.jsx';

const TEXT_FIELDS = [
  ['full_name_bn', 'common.nameBn'], ['full_name_en', 'common.nameEn'],
  ['nickname_bn', 'person.nickname', ' (বাংলা)'], ['nickname_en', 'person.nickname', ' (English)'],
  ['occupation_bn', 'person.occupation', ' (বাংলা)'], ['occupation_en', 'person.occupation', ' (English)'],
  ['birth_place_bn', 'person.birthPlace', ' (বাংলা)'], ['birth_place_en', 'person.birthPlace', ' (English)'],
  ['death_place_bn', 'person.deathPlace', ' (বাংলা)'], ['death_place_en', 'person.deathPlace', ' (English)'],
  ['burial_place_bn', 'person.burialPlace', ' (বাংলা)'], ['burial_place_en', 'person.burialPlace', ' (English)'],
];
const LONG_FIELDS = [['biography_bn', 'person.biography', ' (বাংলা)'], ['biography_en', 'person.biography', ' (English)']];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function PersonFields({ form, set, full, simple }) {
  const { t } = useTranslation();
  const text = !full ? TEXT_FIELDS.slice(0, 2) : simple ? TEXT_FIELDS.filter(([k]) => !k.includes('_place_')) : TEXT_FIELDS;
  const enumOptions = (group) => ['unknown', ...Object.keys(t(group, { returnObjects: true })).filter((k) => k !== 'unknown')].map((v) => ({ value: v, label: t(`${group}.${v}`) }));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {text.map(([k, label, suffix = '']) => <Field key={k} label={t(label) + suffix}>{(id) => <Input id={id} value={form[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} />}</Field>)}
        <Field label={t('person.sexLabel')}>{(id) => <Select id={id} value={form.sex ?? 'unknown'} onChange={(e) => set({ sex: e.target.value })} options={enumOptions('person.sex')} />}</Field>
        <Field label={t('common.status')}>{(id) => <Select id={id} value={form.living_status ?? 'unknown'} onChange={(e) => set({ living_status: e.target.value })} options={enumOptions('person.living')} />}</Field>
      </div>
      <Field label={t('person.born')}><FuzzyDateInput value={form.birth} onChange={(v) => set({ birth: v })} /></Field>
      <Field label={t('person.died')}><FuzzyDateInput value={form.death} onChange={(v) => set({ death: v, ...(v ? { living_status: 'deceased' } : {}) })} /></Field>
      {full && !simple && LONG_FIELDS.map(([k, label, suffix]) => <Field key={k} label={t(label) + suffix}>{(id) => <Textarea id={id} value={form[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} />}</Field>)}
    </>
  );
}

function Duplicates({ name, birthYear, onUse }) {
  const { t, i18n } = useTranslation();
  const q = useDeferredValue((name ?? '').trim());
  const { data } = useQuery({ queryKey: ['duplicates', q, birthYear], queryFn: () => api.get('/people/duplicates', { name: q, birthYear }), enabled: q.length >= 3 });
  if (!data?.items.length) return null;
  return (
    <div className="rounded-xl border border-turmeric-500/50 bg-turmeric-100/60 p-3 text-sm">
      <p className="font-medium text-turmeric-600">{t('editor.possibleDuplicates')}</p>
      {data.items.map(({ person }) => (
        <div key={person.id} className="mt-1 flex items-center justify-between">
          <span>{personName(person, i18n.language)} <span className="text-muted">{lifespan(person, i18n.language)}</span></span>
          <button type="button" className="text-forest-700 underline" onClick={() => onUse(person)}>{t('editor.useThis')}</button>
        </div>
      ))}
    </div>
  );
}

export function PersonEditor({ mode, profile, marriage, link, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { person, spouses, parents } = profile;
  const isAdd = ['addChild', 'addSpouse', 'addParent'].includes(mode);
  const initial = mode === 'edit' ? { ...person } : {};
  const [form, setForm] = useState(initial);
  const [existing, setExisting] = useState(null);
  const [rel, setRel] = useState(mode === 'editMarriage'
    ? { status: marriage.status, start_date: marriage.start_date, end_date: marriage.end_date, order: marriage.order_for_person ?? '' }
    : { relationship_type: 'biological', status: 'ongoing', otherParent: '', familyId: person.primary_family?.id ?? '', order: spouses.length + 1 });
  const [summary, setSummary] = useState('');
  const [rationale, setRationale] = useState('');
  const [done, setDone] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setR = (patch) => setRel((r) => ({ ...r, ...patch }));
  const name = personName(person, lang);
  const title = t({ edit: 'editor.editPerson', addChild: 'editor.addChild', addSpouse: 'editor.addSpouse', addParent: 'editor.addParent', editMarriage: 'editor.editMarriage', remove: 'editor.removeLink' }[mode]);
  const defaultSummary = `${title}: ${name}`;

  const marriageDates = () => {
    const ended = ['divorced', 'widowed', 'annulled'].includes(rel.status);
    return { status: rel.status, start_date: cleanFuzzyDate(rel.start_date), end_date: ended ? cleanFuzzyDate(rel.end_date) : null };
  };

  function buildItems() {
    if (mode === 'remove') return [{ entity_type: link.entity, action: 'delete', target_id: link.id }];
    if (mode === 'editMarriage') return [{ entity_type: 'marriage', action: 'update', target_id: marriage.marriage_id, payload: marriageDates() }];
    if (mode === 'edit') {
      const payload = {};
      for (const k of [...TEXT_FIELDS, ...LONG_FIELDS].map(([f]) => f)) if ((form[k] ?? '') !== (person[k] ?? '')) payload[k] = form[k];
      for (const k of ['sex', 'living_status']) if (form[k] !== person[k]) payload[k] = form[k];
      for (const k of ['birth', 'death']) if (!same(cleanFuzzyDate(form[k]), person[k])) payload[k] = cleanFuzzyDate(form[k]);
      if (form.privacy_level && form.privacy_level !== person.privacy_level) payload.privacy_level = form.privacy_level;
      return [{ entity_type: 'person', action: 'update', target_id: person.id, payload }];
    }
    const items = [];
    const ref = existing ? existing.id : '$new_person';
    if (!existing) {
      const payload = { sex: form.sex ?? 'unknown', living_status: form.living_status ?? 'unknown' };
      for (const k of ['full_name_bn', 'full_name_en']) if (form[k]) payload[k] = form[k];
      for (const k of ['birth', 'death']) if (cleanFuzzyDate(form[k])) payload[k] = form[k];
      items.push({ entity_type: 'person', action: 'create', temp_ref: 'new_person', payload });
      if (rel.familyId && mode !== 'addParent') {
        items.push({ entity_type: 'family_member', action: 'create', payload: {
          family_id: rel.familyId, person_id: ref, is_primary: true,
          membership_type: mode === 'addSpouse' ? 'marriage' : rel.relationship_type === 'biological' ? 'lineage' : 'adoption',
        } });
      }
    }
    if (mode === 'addSpouse') {
      items.push({ entity_type: 'marriage', action: 'create', payload: {
        spouse1_id: person.id, spouse2_id: ref, ...marriageDates(), ...(rel.order ? { spouse1_order: Number(rel.order) } : {}),
      } });
    } else {
      const [parent, child] = mode === 'addChild' ? [person.id, ref] : [ref, person.id];
      const type = { relationship_type: rel.relationship_type };
      items.push({ entity_type: 'parent_child', action: 'create', payload: { parent_id: parent, child_id: child, ...type } });
      // Only an explicitly chosen other parent is linked; spouses are never assumed.
      if (mode === 'addChild' && rel.otherParent) {
        items.push({ entity_type: 'parent_child', action: 'create', payload: { parent_id: rel.otherParent, child_id: child, ...type } });
      }
    }
    return items;
  }

  const save = useMutation({
    mutationFn: () => {
      const items = buildItems();
      return auth.isModerator
        ? api.post('/proposals/apply', { items })
        : api.post('/proposals', { familyId: person.primary_family?.id ?? null, summary: summary.trim() || defaultSummary, rationale, items });
    },
    onSuccess: () => {
      setDone(true);
      if (auth.isModerator) queryClient.invalidateQueries(); else queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
  });

  const statusOptions = Object.entries(t('person.marriageStatus', { returnObjects: true })).map(([value, label]) => ({ value, label }));
  return (
    <Modal open wide onClose={onClose} title={`${title} — ${name}`}>
      {done ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-forest-100 p-4 text-forest-800">{t(auth.isModerator ? 'proposals.appliedDirectly' : 'proposals.sentForReview')}</p>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {!auth.isModerator && <p className="rounded-lg bg-river-100 px-3 py-2 text-sm text-river-600">{t('proposals.memberNote')}</p>}

          {mode === 'edit' && <PersonFields full simple={profile.married_in} form={form} set={set} />}
          {mode === 'edit' && auth.isModerator && (
            <Field label={t('editor.privacy')}>{(id) => <Select id={id} value={form.privacy_level ?? ''} onChange={(e) => set({ privacy_level: e.target.value || null })}
              options={[{ value: '', label: t('editor.privacyAuto') }, ...Object.entries(t('editor.privacyLevels', { returnObjects: true })).map(([value, label]) => ({ value, label }))]} />}</Field>
          )}
          {mode === 'remove' && <p>{t('common.confirm')}</p>}

          {isAdd && <Field label={t('editor.existingPerson')}><PersonPicker value={existing} onChange={setExisting} excludeId={person.id} /></Field>}
          {isAdd && !existing && (
            <fieldset className="space-y-3 rounded-xl border border-line p-4">
              <legend className="px-2 text-sm text-muted">{t('editor.orNew')}</legend>
              <PersonFields form={form} set={set} />
              <Duplicates name={form.full_name_bn || form.full_name_en} birthYear={form.birth?.year} onUse={setExisting} />
              {mode !== 'addParent' && profile.families.length > 0 && (
                <Field label={t('editor.family')}>{(id) => <Select id={id} value={rel.familyId} onChange={(e) => setR({ familyId: e.target.value })}
                  options={[{ value: '', label: t('editor.noFamily') }, ...profile.families.map((f) => ({ value: f.id, label: pick(f, 'name', lang) }))]} />}</Field>
              )}
            </fieldset>
          )}
          {(mode === 'addChild' || mode === 'addParent') && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('editor.relationshipType')}>{(id) => <Select id={id} value={rel.relationship_type} onChange={(e) => setR({ relationship_type: e.target.value })} options={['biological', 'adoptive', 'foster'].map((v) => ({ value: v, label: t(`editor.${v}`) }))} />}</Field>
              {mode === 'addChild' && (
                <Field label={t('editor.otherParent')}>{(id) => <Select id={id} value={rel.otherParent} onChange={(e) => setR({ otherParent: e.target.value })}
                  options={[{ value: '', label: t('editor.chooseOtherParent') }, ...[...new Map(spouses.map((s) => [s.spouse.id, s.spouse])).values()].map((s) => ({ value: s.id, label: personName(s, lang) }))]} />}</Field>
              )}
            </div>
          )}
          {(mode === 'addSpouse' || mode === 'editMarriage') && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('editor.marriageStatus')}>{(id) => <Select id={id} value={rel.status} onChange={(e) => setR({ status: e.target.value })} options={statusOptions} />}</Field>
                {mode === 'addSpouse' && <Field label={t('editor.order')} hint={rel.order ? ordinal(Number(rel.order), lang) : ''}>{(id) => <Input id={id} type="number" min="1" max="20" value={rel.order} onChange={(e) => setR({ order: e.target.value })} />}</Field>}
              </div>
              <Field label={t('editor.marriageStart')}><FuzzyDateInput value={rel.start_date} onChange={(v) => setR({ start_date: v })} /></Field>
              {['divorced', 'widowed', 'annulled'].includes(rel.status) && <Field label={t('editor.marriageEnd')}><FuzzyDateInput value={rel.end_date} onChange={(v) => setR({ end_date: v })} /></Field>}
            </div>
          )}
          {mode === 'addParent' && <p className="text-sm text-muted">{t('person.parents')}: {num(parents.length, lang)}</p>}

          {!auth.isModerator && (
            <>
              <Field label={t('proposals.summary')}>{(id) => <Input id={id} placeholder={defaultSummary} value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field>
              <Field label={t('proposals.rationale')}>{(id) => <Textarea id={id} value={rationale} onChange={(e) => setRationale(e.target.value)} />}</Field>
            </>
          )}
          <InlineError error={save.error} />
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending}>{t(auth.isModerator ? 'editor.apply' : 'editor.propose')}</Button>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
