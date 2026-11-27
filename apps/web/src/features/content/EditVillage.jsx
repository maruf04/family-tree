import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { FuzzyDateInput, cleanFuzzyDate } from '../../components/FuzzyDateInput.jsx';
import { Button, Field, InlineError, Input, Modal, Textarea } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

const TEXT = [['name_bn', 'common.nameBn'], ['name_en', 'common.nameEn'], ['tagline_bn', 'home.taglineBn'], ['tagline_en', 'home.taglineEn'],
  ['village_name_bn', 'home.villageBn'], ['village_name_en', 'home.villageEn'], ['union_name', 'home.union'], ['upazila', 'home.upazila'], ['district', 'home.district']];
const LONG = [['introduction_bn', 'home.introBn'], ['introduction_en', 'home.introEn']];
const NUMBER = [['latitude', 'home.latitude'], ['longitude', 'home.longitude']];

function VillageForm({ village, onDone }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(village ?? {});
  const bind = (k) => ({ value: form[k] ?? '', onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const save = useMutation({
    mutationFn: () => {
      const body = { established: cleanFuzzyDate(form.established) };
      for (const [k] of [...TEXT, ...LONG]) body[k] = form[k] ?? '';
      for (const [k] of NUMBER) body[k] = form[k] === '' || form[k] == null ? null : Number(form[k]);
      return api.patch('/home/village', body);
    },
    onSuccess: () => { queryClient.invalidateQueries(); onDone(); },
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        {TEXT.map(([k, label]) => <Field key={k} label={t(label)}>{(id) => <Input id={id} required={k === 'name_bn'} {...bind(k)} />}</Field>)}
      </div>
      {LONG.map(([k, label]) => <Field key={k} label={t(label)}>{(id) => <Textarea id={id} {...bind(k)} />}</Field>)}
      <Field label={t('home.established')}><FuzzyDateInput value={form.established} onChange={(v) => setForm({ ...form, established: v })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {NUMBER.map(([k, label]) => <Field key={k} label={t(label)}>{(id) => <Input id={id} type="number" step="any" {...bind(k)} />}</Field>)}
      </div>
      <InlineError error={save.error} />
      <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
    </form>
  );
}

export function EditVillageButton({ village }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (!auth.isModerator) return null;
  return (
    <>
      <Button variant="secondary" size="lg" className="!text-base" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" />{t('home.editVillage')}</Button>
      <Modal wide open={open} onClose={() => setOpen(false)} title={t('home.editVillage')}><div className="text-ink"><VillageForm village={village} onDone={() => setOpen(false)} /></div></Modal>
    </>
  );
}
