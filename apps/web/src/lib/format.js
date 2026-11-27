// Bilingual formatting: Bangla digits, fuzzy historical dates, bilingual fields.

const LOCALES = { bn: 'bn-BD', en: 'en-GB' };
const MONTHS = {
  bn: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export const otherLang = (lang) => (lang === 'bn' ? 'en' : 'bn');

/** Pick obj[field_lang], falling back to the other language. */
export function pick(obj, field, lang) {
  if (!obj) return '';
  return obj[`${field}_${lang}`] || obj[`${field}_${otherLang(lang)}`] || '';
}

export const personName = (p, lang) => pick(p, 'full_name', lang) || '—';

export function num(n, lang, opts = {}) {
  if (n == null || Number.isNaN(n)) return '';
  return new Intl.NumberFormat(LOCALES[lang], opts).format(n);
}

/** Year without grouping: ১৮৮০ / 1880. */
export const year = (y, lang) => num(y, lang, { useGrouping: false });

function partial(y, m, d, lang) {
  const parts = [];
  if (d) parts.push(num(d, lang));
  if (m) parts.push(MONTHS[lang][m - 1]);
  parts.push(year(y, lang));
  return parts.join(' ');
}

/** Full fuzzy date: "আনুমানিক ১৮৮০", "between 1880 and 1885", "১৪ আগস্ট ১৯৫২". */
export function fuzzyDate(fd, lang) {
  if (!fd?.year) return '';
  const start = partial(fd.year, fd.month, fd.day, lang);
  const end = fd.year_to ? partial(fd.year_to, fd.month_to, fd.day_to, lang) : '';
  if (lang === 'bn') {
    switch (fd.qualifier) {
      case 'about': return `আনুমানিক ${start}`;
      case 'before': return `${start}-এর আগে`;
      case 'after': return `${start}-এর পরে`;
      case 'between': return `${start} থেকে ${end}-এর মধ্যে`;
      default: return start;
    }
  }
  switch (fd.qualifier) {
    case 'about': return `about ${start}`;
    case 'before': return `before ${start}`;
    case 'after': return `after ${start}`;
    case 'between': return `between ${start} and ${end}`;
    default: return start;
  }
}

/** Compact year for cards: "আনু. ১৮৮০", "c. 1880", "১৮৮২–১৮৮৬". */
export function fuzzyYear(fd, lang) {
  if (!fd?.year) return '';
  const y = year(fd.year, lang);
  switch (fd.qualifier) {
    case 'about': return lang === 'bn' ? `আনু. ${y}` : `c. ${y}`;
    case 'before': return lang === 'bn' ? `${y}-এর আগে` : `bef. ${y}`;
    case 'after': return lang === 'bn' ? `${y}-এর পরে` : `aft. ${y}`;
    case 'between': return `${y}–${year(fd.year_to, lang)}`;
    default: return y;
  }
}

/** "১৮৮০ – ১৯৫২", "জন্ম ১৯৮০", "" */
export function lifespan(person, lang) {
  if (!person) return '';
  const b = fuzzyYear(person.birth, lang);
  const d = fuzzyYear(person.death, lang);
  if (b && d) return `${b} – ${d}`;
  if (b) return person.living_status === 'deceased' ? `${b} – ?` : (lang === 'bn' ? `জন্ম ${b}` : `b. ${b}`);
  if (d) return lang === 'bn' ? `মৃত্যু ${d}` : `d. ${d}`;
  return '';
}

export function dateTime(value, lang, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '';
  return new Intl.DateTimeFormat(LOCALES[lang], { hourCycle: 'h23', ...opts }).format(new Date(value));
}

export function dateOnly(value, lang) {
  return dateTime(value, lang, { dateStyle: 'long' });
}

export function relativeTime(value, lang) {
  if (!value) return '';
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: 'auto' });
  const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month']];
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  for (let i = 1; i < steps.length; i += 1) {
    if (abs < steps[i][0]) return rtf.format(Math.round(diff / steps[i - 1][0]), steps[i - 1][1]);
  }
  return rtf.format(Math.round(diff / 31557600), 'year');
}

export function money(n, lang) {
  return `৳${num(n, lang, { maximumFractionDigits: 0 })}`;
}

const BN_ORDINALS = { 1: 'ম', 2: 'য়', 3: 'য়', 4: 'র্থ', 5: 'ম', 6: 'ষ্ঠ', 7: 'ম', 8: 'ম', 9: 'ম', 10: 'ম' };
/** ১ম, ২য়, ৩য়, ৪র্থ … / 1st, 2nd, 3rd … */
export function ordinal(n, lang) {
  if (lang === 'bn') return `${num(n, 'bn')}${BN_ORDINALS[n] ?? 'তম'}`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
