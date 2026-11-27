// Upload the family spreadsheets: check first, then import. Nothing is saved
// unless every row is correct.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, GitBranch, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Field, InlineError, Input, Section, Stat } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { num } from '../../lib/format.js';

/** Read as UTF-8; other encodings would corrupt Bangla, so they are refused by the server. */
const readFile = (file) => new Response(file).arrayBuffer().then((b) => new TextDecoder('utf-8').decode(b));

export function ImportFamily() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [files, setFiles] = useState({ people: null, marriages: null });
  const [form, setForm] = useState({ root: null, familyNameBn: '', familyNameEn: '' });
  const families = useQuery({ queryKey: ['import'], queryFn: () => api.get('/import') });
  const current = families.data?.families[0];
  const root = form.root ?? current?.root_code ?? '1';
  const run = useMutation({
    mutationFn: async (apply) => api.post('/import', {
      people: await readFile(files.people), marriages: files.marriages ? await readFile(files.marriages) : null,
      root, familyNameBn: form.familyNameBn || current?.name_bn || null, familyNameEn: form.familyNameEn || current?.name_en || null, apply,
    }),
    onSuccess: (data) => { if (data.applied) queryClient.invalidateQueries(); },
  });
  const result = run.data;
  const choose = (k) => (e) => { setFiles({ ...files, [k]: e.target.files[0] ?? null }); run.reset(); };
  const change = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); run.reset(); };
  const clean = result && result.errors.length === 0;
  const isNew = families.isSuccess && !current;
  const issue = (x) => {
    const key = `import.errors.${x.code}`;
    const text = i18n.exists(key) ? t(key) : i18n.exists(`errors.${x.code}`) ? t(`errors.${x.code}`) : x.code;
    return `${text}${x.detail ? ` (${x.detail})` : ''}`;
  };
  return (
    <div className="space-y-8">
      <Section title={`${num(1, lang)}. ${t("import.step1")}`}>
        <Card className="space-y-3 p-5">
          <p>{t('import.step1Text')}</p>
          <div className="flex flex-wrap gap-3">
            {['people', 'marriages'].map((k) => <a key={k} href={`/templates/${k}.csv`} download className="inline-flex items-center gap-2 rounded-lg border border-line bg-paper px-4 py-2 font-medium text-forest-800 hover:bg-forest-50"><Download className="h-4 w-4" />{t(`import.${k}Template`)}</a>)}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{t('import.rules', { returnObjects: true }).map((r) => <li key={r}>{r}</li>)}</ul>
        </Card>
      </Section>

      <Section title={`${num(2, lang)}. ${t('import.step2')}`}>
        <Card as="form" className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); run.mutate(false); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('import.peopleFile')}>{(id) => <Input id={id} type="file" accept=".csv,text/csv" required onChange={choose('people')} />}</Field>
            <Field label={`${t('import.marriagesFile')} (${t('common.optional')})`}>{(id) => <Input id={id} type="file" accept=".csv,text/csv" onChange={choose('marriages')} />}</Field>
            <Field label={t('import.root')} hint={t('import.rootHint')}>{(id) => <Input id={id} required value={root} onChange={change('root')} />}</Field>
            {isNew && <Field label={t('import.familyName')}>{(id) => <Input id={id} required value={form.familyNameBn} onChange={change('familyNameBn')} />}</Field>}
          </div>
          <InlineError error={run.error} />
          <Button type="submit" variant={clean ? 'secondary' : 'primary'} disabled={!files.people} loading={run.isPending}>{t('import.check')}</Button>
        </Card>
      </Section>

      {result && (
        <Section title={`${num(3, lang)}. ${t('import.step3')}`}>
          {result.applied ? (
            <Card className="space-y-3 border-forest-300 bg-forest-50 p-5">
              <p className="flex items-center gap-2 text-lg font-semibold text-forest-800"><CheckCircle2 className="h-6 w-6" />{t('import.done')}</p>
              <Link to={`/people/${result.rootId}/tree?depth=6`} className="inline-flex items-center gap-2 rounded-lg bg-forest-700 px-4 py-2 font-medium text-paper hover:bg-forest-800"><GitBranch className="h-4 w-4" />{t('families.viewTree')}</Link>
            </Card>
          ) : (
            <>
              {result.errors.length > 0 && (
                <Card className="border-clay-600/40 p-5">
                  <p className="font-semibold text-clay-700">{t('import.fix', { n: num(result.errors.length, lang) })}</p>
                  <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto text-sm">
                    {result.errors.map((x, i) => <li key={i} className="flex gap-2"><Badge tone="clay">{t(`import.${x.file}Short`)}{x.line > 0 && ` · ${t('import.line')} ${num(x.line, lang, { useGrouping: false })}`}</Badge><span>{issue(x)}</span></li>)}
                  </ul>
                </Card>
              )}
              {result.warnings.length > 0 && (
                <Card className="border-turmeric-500/50 bg-turmeric-100/40 p-5">
                  <p className="font-semibold text-turmeric-600">{t('import.warnings')}</p>
                  <ul className="mt-2 space-y-1 text-sm">{result.warnings.map((x, i) => <li key={i}>{t('import.line')} {num(x.line, lang, { useGrouping: false })}: {issue(x)}</li>)}</ul>
                </Card>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat value={num(result.counts.people, lang)} label={t('import.newPeople')} />
                <Stat value={num(result.counts.peopleExisting, lang)} label={t('import.existing')} />
                <Stat value={num(result.counts.parents, lang)} label={t('import.parentLinks')} />
                <Stat value={num(result.counts.marriages, lang)} label={t('import.newMarriages')} />
              </div>
              {clean && <div className="flex flex-wrap items-center gap-3"><Button size="lg" loading={run.isPending} onClick={() => run.mutate(true)}><Upload className="h-5 w-5" />{t('import.apply')}</Button><span className="text-sm text-muted">{t('import.notSaved')}</span></div>}
            </>
          )}
        </Section>
      )}
    </div>
  );
}
