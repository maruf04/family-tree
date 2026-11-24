// Village history archive. Public rows are readable without login; members
// see members-level rows; moderators curate everything.
import { Router } from 'express';
import { crudRouter } from '../../lib/crud.js';

export const historyRouter = Router();

historyRouter.use('/articles', crudRouter({
  table: 'history_articles',
  fields: {
    category: ['origin', 'founders', 'culture', 'tradition', 'lifestyle', 'religion', 'festival', 'food', 'other'],
    title_bn: 'text', title_en: 'text', summary_bn: 'long', summary_en: 'long',
    body_bn: 'long', body_en: 'long', sort_order: 'int', cover_photo_id: 'uuid',
  },
  requireOneOf: ['title_bn', 'title_en'],
  required: ['category'],
  filters: ['category'],
  orderBy: 't.sort_order, t.created_at',
  privacy: true,
  publicRead: true,
}));

historyRouter.use('/events', crudRouter({
  table: 'historical_events',
  fields: {
    category: ['founding', 'settlement', 'religious', 'education', 'infrastructure', 'disaster', 'war',
      'political', 'cultural', 'economic', 'other'],
    title_bn: 'text', title_en: 'text', description_bn: 'long', description_en: 'long',
    event_date: 'fuzzy', end_date: 'fuzzy', place_bn: 'text', place_en: 'text', is_featured: 'bool',
  },
  requireOneOf: ['title_bn', 'title_en'],
  filters: ['category'],
  orderBy: 'fuzzy_date_sort_key(t.event_date) NULLS LAST, t.created_at',
  privacy: true,
  publicRead: true,
}));

historyRouter.use('/documents', crudRouter({
  table: 'historical_documents',
  fields: {
    document_type: ['land_deed', 'letter', 'certificate', 'government_record', 'religious_record', 'manuscript',
      'newspaper', 'map', 'other'],
    title_bn: 'text', title_en: 'text', description_bn: 'long', description_en: 'long',
    document_date: 'fuzzy', transcription: 'long', repository: 'text', media_id: 'uuid',
  },
  requireOneOf: ['title_bn', 'title_en'],
  filters: ['document_type'],
  orderBy: 'fuzzy_date_sort_key(t.document_date) NULLS LAST, t.created_at',
  privacy: true,
}));

historyRouter.use('/photos', crudRouter({
  table: 'historical_photos',
  fields: {
    title_bn: 'text', title_en: 'text', description_bn: 'long', description_en: 'long',
    photo_date: 'fuzzy', photographer: 'text', media_id: 'uuid',
  },
  required: ['media_id'],
  orderBy: 'fuzzy_date_sort_key(t.photo_date) NULLS LAST, t.created_at',
  privacy: true,
}));

historyRouter.use('/oral-histories', crudRouter({
  table: 'oral_histories',
  fields: {
    title_bn: 'text', title_en: 'text', narrator_person_id: 'uuid', narrator_name: 'text', interviewer: 'text',
    recorded_date: 'fuzzy', summary_bn: 'long', summary_en: 'long', transcript: 'long', media_id: 'uuid',
  },
  requireOneOf: ['title_bn', 'title_en'],
  orderBy: 'fuzzy_date_sort_key(t.recorded_date) DESC NULLS LAST',
  privacy: true,
  joins: 'LEFT JOIN people np ON np.id = t.narrator_person_id',
  extraSelect: `'narrator', CASE WHEN np.id IS NULL THEN NULL ELSE jsonb_build_object('id', np.id, 'full_name_bn', np.full_name_bn, 'full_name_en', np.full_name_en) END`,
}));
