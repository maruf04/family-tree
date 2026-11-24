import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, InlineError, Section } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { personName } from '../../lib/format.js';
import { kinshipTerm } from '../../lib/kinship.js';
import { PersonPicker } from './PersonPicker.jsx';

/** "How is X related to this person?" with proper Bangla kinship terms. */
export function RelationshipFinder({ person }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [other, setOther] = useState(null);
  const { data, error } = useQuery({ queryKey: ['relation', person.id, other?.id], queryFn: () => api.get(`/people/${person.id}/relationship/${other.id}`), enabled: Boolean(other) });
  return (
    <Section title={t('person.findRelation')}>
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted">{t('person.relationPrompt')}</p>
        <PersonPicker value={other} onChange={setOther} excludeId={person.id} />
        <InlineError error={error} />
        {data && other && (
          <p className="rounded-xl bg-forest-50 p-3">
            {data.kind === 'none' ? kinshipTerm(data, lang) : lang === 'bn'
              ? <>{personName(other, lang)} হলেন {personName(person, lang)}-এর <strong className="text-forest-800">{kinshipTerm(data, lang)}</strong></>
              : <>{personName(other, lang)} is {personName(person, lang)}’s <strong className="text-forest-800">{kinshipTerm(data, lang)}</strong></>}
          </p>
        )}
      </Card>
    </Section>
  );
}
