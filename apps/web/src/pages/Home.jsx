import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, GitBranch, MapPin, Megaphone, MessageCircle, ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EditVillageButton } from '../features/content/EditVillage.jsx';
import { Badge, Card, cx, EmptyState, QueryState, Section, Stat } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { dateTime, fuzzyDate, num, pick, relativeTime, year } from '../lib/format.js';

function Landscape() {
  // Decorative river-and-paddy scene standing in until a cover photo is uploaded.
  return (
    <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-28 w-full sm:h-40" aria-hidden>
      <path d="M0 130C200 80 380 150 600 110s380-50 600 10v100H0z" fill="#173d2b" />
      <path d="M0 165c240-40 420 20 640-8s380-24 560 12v51H0z" fill="#2a6149" />
      <path d="M0 200c300-26 620 12 1200-14v34H0z" fill="#2f6f86" opacity=".75" />
      <g fill="#0d2418">
        <path d="M948 128c-3-24 1-44 6-60 6 16 9 36 6 60z" />
        <circle cx="954" cy="62" r="20" /><circle cx="938" cy="72" r="13" /><circle cx="971" cy="73" r="14" />
        <path d="M180 124l34-24 34 24v26h-68z" /><path d="M168 126l46-34 46 34z" fill="#964f2a" />
      </g>
    </svg>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const auth = useAuth();
  const home = useQuery({ queryKey: ['home', auth.user?.id ?? null], queryFn: () => api.get('/home') });

  return (
    <QueryState query={home}>
      {({ village, stats, timeline, latestPosts, news, upcomingEvents, announcements }) => (
        <>
          <div className="relative overflow-hidden bg-forest-900 text-paper nakshi">
            <div className="relative z-10 mx-auto max-w-6xl px-4 pb-36 pt-14 sm:pb-52 sm:pt-20">
              <p className="animate-rise text-turmeric-500">{pick(village, 'tagline', lang) || t('app.tagline')}</p>
              <h1 className="mt-2 animate-rise text-4xl font-semibold sm:text-6xl">{pick(village, 'name', lang) || t('app.name')}</h1>
              <p className="mt-5 max-w-2xl animate-rise text-forest-100 sm:text-lg">{pick(village, 'introduction', lang)}</p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-forest-300">
                {village?.established && <span>{t('home.established')}: {fuzzyDate(village.established, lang)}</span>}
                {(village?.upazila || village?.village_name_bn) && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{[pick(village, 'village_name', lang), village.union_name, village.upazila, village.district].filter(Boolean).join(', ')}</span>}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                {auth.verified ? <><Link to="/families" className="inline-flex items-center gap-2 rounded-lg bg-turmeric-500 px-5 py-2.5 font-semibold text-forest-950 hover:bg-turmeric-600"><GitBranch className="h-5 w-5" />{t('home.explore')}</Link>
                <Link to="/history" className="inline-flex items-center gap-2 rounded-lg border border-forest-300/50 px-5 py-2.5 font-medium text-paper hover:bg-forest-800"><ScrollText className="h-5 w-5" />{t('home.history')}</Link></> : <Link to="/login" className="rounded-lg bg-turmeric-500 px-6 py-2.5 font-semibold text-forest-950 hover:bg-turmeric-600">{t('nav.login')}</Link>}
                <EditVillageButton village={village} />
              </div>
            </div>
            <Landscape />
          </div>

          <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
            <div className={cx('grid grid-cols-2 gap-3', auth.verified ? 'sm:grid-cols-5' : 'sm:grid-cols-4')}>
              <Stat value={num(stats.families, lang)} label={t('home.stats.families')} />
              <Stat value={num(stats.people, lang)} label={t('home.stats.people')} />
              <Stat value={num(stats.generations ?? 0, lang)} label={t('home.stats.generations')} />
              {auth.verified && <Stat value={stats.earliest_year ? year(stats.earliest_year, lang) : '—'} label={t('home.stats.earliest')} />}
              <Stat value={num(stats.members, lang)} label={t('home.stats.members')} />
            </div>

            {announcements?.length > 0 && (
              <div className="space-y-2">
                {announcements.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-xl border border-turmeric-500/40 bg-turmeric-100/60 px-4 py-3">
                    <Megaphone className="mt-1 h-5 w-5 shrink-0 text-turmeric-600" aria-hidden />
                    <div><strong>{pick(a, 'title', lang)}</strong><p className="text-sm text-muted">{pick(a, 'body', lang)}</p></div>
                  </div>
                ))}
              </div>
            )}

            {timeline?.length > 0 && (
              <Section title={t('home.timeline')} action={<Link to="/history?tab=timeline" className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline">{t('common.viewAll')}<ArrowRight className="h-4 w-4" /></Link>}>
                <ol className="flex snap-x gap-4 overflow-x-auto pb-3">
                  {timeline.map((e) => (
                    <li key={e.id} className="w-60 shrink-0 snap-start rounded-2xl border border-line border-t-4 border-t-clay-600 bg-white/70 p-4">
                      <div className="font-display text-lg font-semibold text-clay-700">{fuzzyDate(e.event_date, lang) || t('date.unknown')}</div>
                      <div className="mt-1 font-medium">{pick(e, 'title', lang)}</div>
                      <Badge className="mt-2">{t(`history.eventCategories.${e.category}`)}</Badge>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {latestPosts ? (
              <div className="grid gap-10 lg:grid-cols-3">
                <Section className="lg:col-span-2" title={t('home.latestPosts')} action={<Link to="/community" className="text-sm font-medium text-forest-700 hover:underline">{t('common.viewAll')}</Link>}>
                  {latestPosts.length === 0 && <EmptyState />}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {latestPosts.map((p) => (
                      <Link key={p.id} to={`/community/posts/${p.id}`}>
                        <Card className="h-full p-4 transition-colors hover:border-forest-300">
                          <div className="flex items-center justify-between text-xs text-muted">
                            <Badge tone="green">{t(`community.postTypes.${p.post_type}`)}</Badge>{relativeTime(p.created_at, lang)}
                          </div>
                          {p.title && <div className="mt-2 font-semibold">{p.title}</div>}
                          <p className="mt-1 line-clamp-2 text-sm text-muted">{p.body}</p>
                          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                            <span>{pick(p, 'author_name', lang)}</span>
                            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{num(p.comment_count, lang)}</span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </Section>
                <Section title={t('home.upcoming')}>
                  {upcomingEvents.length === 0 && <EmptyState title={t('community.noEvents')} icon={CalendarDays} />}
                  {upcomingEvents.map((e) => (
                    <Link key={e.id} to="/community?tab=events" className="flex gap-3 rounded-xl border border-line bg-white/70 p-3 hover:border-forest-300">
                      <CalendarDays className="mt-1 h-5 w-5 shrink-0 text-clay-600" aria-hidden />
                      <div><div className="font-medium">{pick(e, 'title', lang)}</div><div className="text-sm text-muted">{dateTime(e.starts_at, lang)}</div></div>
                    </Link>
                  ))}
                </Section>
                <Section className="lg:col-span-3" title={t('home.news')} action={<Link to="/affairs" className="text-sm font-medium text-forest-700 hover:underline">{t('common.viewAll')}</Link>}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {news.map((n) => (
                      <Link key={n.id} to={`/affairs/news/${n.id}`}>
                        <Card className="h-full p-4 hover:border-forest-300">
                          <Badge tone="river">{pick(n, 'category_name', lang)}</Badge>
                          <div className="mt-2 font-semibold leading-snug">{pick(n, 'title', lang)}</div>
                          <p className="mt-1 line-clamp-3 text-sm text-muted">{pick(n, 'summary', lang)}</p>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </Section>
              </div>
            ) : (
              <Section title={t('home.featuresTitle')}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[['tree', GitBranch], ['history', ScrollText], ['community', MessageCircle], ['map', MapPin], ['events', CalendarDays], ['news', Megaphone]].map(([k, Icon]) => (
                    <Card key={k} className="p-5"><Icon className="h-7 w-7 text-clay-600" aria-hidden /><h3 className="mt-3 text-lg font-semibold text-forest-900">{t(`home.features.${k}.title`)}</h3><p className="mt-1 text-muted">{t(`home.features.${k}.text`)}</p></Card>
                  ))}
                </div>
                <p className="pt-2 text-center text-muted">{t('home.privateNote')}</p>
              </Section>
            )}
          </div>
        </>
      )}
    </QueryState>
  );
}
