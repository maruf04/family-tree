// "Add" buttons with a form for simple bilingual content (moderators; members
// for their own businesses, events and groups).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { FuzzyDateInput, cleanFuzzyDate } from '../../components/FuzzyDateInput.jsx';
import { Button, Field, InlineError, Input, Modal, Select, Textarea } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

const names = [['name_bn', 'common.nameBn'], ['name_en', 'common.nameEn']];
const titles = [['title_bn', 'common.titleBn'], ['title_en', 'common.titleEn']];
const descriptions = [['description_bn', 'common.descriptionBn', 'long'], ['description_en', 'common.descriptionEn', 'long']];

// Field: [name, label key, kind, options]. `enumOf` names an i18n group whose keys are the options.
const KINDS = {
  event: {
    path: '/history/events', label: 'history.addEvent', invalidate: 'history-events', moderator: true,
    fields: [...titles, ['category', 'affairs.category', 'enum', 'history.eventCategories'], ['event_date', 'common.date', 'fuzzy'], ...descriptions],
  },
  article: {
    path: '/history/articles', label: 'history.addArticle', invalidate: 'history-articles', moderator: true,
    fields: [...titles, ['category', 'affairs.category', 'enum', 'history.categories'], ['summary_bn', 'affairs.summary', 'long'], ['body_bn', 'affairs.bodyBn', 'long'], ['body_en', 'affairs.bodyEn', 'long']],
  },
  business: {
    path: '/directory/businesses', label: 'directory.addBusiness', invalidate: 'businesses',
    fields: [...names, ['business_type', 'affairs.category', 'enum', 'directory.businessTypes'], ['description_bn', 'common.descriptionBn', 'long'], ['contact_phone', 'directory.phone'], ['opening_hours', 'directory.hours']],
  },
  villageEvent: {
    path: '/community/events', label: 'community.newEvent', invalidate: 'events',
    fields: [...titles, ['starts_at', 'community.startsAt', 'datetime'], ['ends_at', 'community.endsAt', 'datetime'], ['location_text', 'community.location'], ['description_bn', 'common.descriptionBn', 'long']],
  },
  group: { path: '/community/groups', label: 'community.newGroup', invalidate: 'groups', fields: [...names, ...descriptions] },
  announcement: {
    path: '/affairs/announcements', label: 'affairs.newAnnouncement', invalidate: 'announcements', moderator: true,
    fields: [...titles, ['body_bn', 'affairs.bodyBn', 'long'], ['body_en', 'affairs.bodyEn', 'long'], ['priority', 'common.status', 'enum', 'affairs.priority'], ['expires_at', 'affairs.expires', 'datetime']],
  },
  news: {
    path: '/affairs/news', label: 'affairs.submit', invalidate: 'news',
    fields: [['category_slug', 'affairs.category', 'select'], ...titles, ['summary_bn', 'affairs.summary', 'long'], ['body_bn', 'affairs.bodyBn', 'long'], ['body_en', 'affairs.bodyEn', 'long']],
  },
};

export function AddContentButton({ kind, options = {}, extraBody, doneMessage }) {
  const cfg = KINDS[kind];
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [done, setDone] = useState(false);
  const enumOptions = (group) => Object.entries(t(group, { returnObjects: true })).map(([value, label]) => ({ value, label }));

  const save = useMutation({
    mutationFn: () => {
      const body = { ...extraBody };
      for (const [name, , type, group] of cfg.fields) {
        let v = form[name];
        if (type === 'enum') v ??= enumOptions(group)[0].value;
        if (type === 'select') v ??= options[name]?.[0]?.value;
        if (type === 'fuzzy') v = cleanFuzzyDate(v);
        if (type === 'datetime' && v) v = new Date(v).toISOString();
        if (v !== undefined && v !== null && v !== '') body[name] = v;
      }
      return api.post(cfg.path, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [cfg.invalidate] });
      setForm({});
      if (doneMessage) setDone(true); else setOpen(false);
    },
  });

  if (!(cfg.moderator ? auth.isModerator : auth.verified)) return null;
  const close = () => { setOpen(false); setDone(false); save.reset(); };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t(cfg.label)}</Button>
      <Modal open={open} onClose={close} title={t(cfg.label)}>
        {done ? <p className="rounded-lg bg-forest-100 p-4 text-forest-800">{doneMessage}</p> : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            {cfg.fields.map(([name, label, type, group]) => (
              <Field key={name} label={t(label)}>
                {(id) => {
                  const props = { id, value: form[name] ?? '', onChange: (e) => setForm({ ...form, [name]: e.target.value }) };
                  if (type === 'long') return <Textarea {...props} />;
                  if (type === 'enum') return <Select {...props} value={form[name] ?? enumOptions(group)[0].value} options={enumOptions(group)} />;
                  if (type === 'select') return <Select {...props} options={options[name] ?? []} />;
                  if (type === 'fuzzy') return <FuzzyDateInput value={form[name]} onChange={(v) => setForm({ ...form, [name]: v })} />;
                  if (type === 'datetime') return <Input type="datetime-local" required={name === 'starts_at'} {...props} />;
                  return <Input {...props} />;
                }}
              </Field>
            ))}
            <InlineError error={save.error} />
            <Button type="submit" loading={save.isPending}>{t('common.submit')}</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
