// Reading the family spreadsheets (CSV saved from Google Sheets or Excel).

/** RFC 4180 CSV; accepts comma, semicolon or tab, a BOM, and quoted line breaks. */
export function parseCsv(input) {
  const s = input.replace(/^﻿/, '');
  const first = s.slice(0, s.search(/\r?\n|$/));
  const delimiter = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) rows.push({ line: startLine, cells: row });
    row = [];
  };
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\n') line += 1;
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell.trim() === '') { cell = ''; quoted = true; } else if (ch === delimiter) endCell();
    else if (ch === '\n') { endRow(); startLine = line; } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return rows;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const asciiDigits = (s) => s.replace(/[০-৯]/g, (d) => BN_DIGITS.indexOf(d));
export const normalizeCode = (s) => asciiDigits(s ?? '').replace(/\s+/g, '').toUpperCase();
const norm = (s) => s.normalize('NFC').toLowerCase().replace(/[\s_]+/g, ' ').trim();

const PEOPLE_HEADERS = {
  code: ['কোড', 'code', 'id'], full_name_bn: ['নাম (বাংলা)', 'নাম', 'name bn'], full_name_en: ['নাম (ইংরেজি)', 'name en', 'name'],
  nickname_bn: ['ডাক নাম', 'nickname'], sex: ['লিঙ্গ', 'sex', 'gender'], birth: ['জন্ম', 'birth', 'born'], death: ['মৃত্যু', 'death', 'died'],
  living: ['জীবিত', 'living', 'alive'], father: ['বাবার কোড', 'father'], mother: ['মায়ের কোড', 'mother'],
  relation: ['সম্পর্ক', 'relation'], occupation_bn: ['পেশা', 'occupation'], birth_place_bn: ['জন্মস্থান', 'birth place'], biography_bn: ['জীবনী', 'biography'],
};
const MARRIAGE_HEADERS = {
  husband: ['স্বামীর কোড', 'husband'], wife: ['স্ত্রীর কোড', 'wife'], order: ['কততম স্ত্রী', 'wife order', 'order'],
  status: ['অবস্থা', 'status'], start: ['বিবাহের তারিখ', 'start'], end: ['সমাপ্তির তারিখ', 'end'],
};

/** Rows → objects keyed by field, with the spreadsheet line number. */
function table(csv, headers, required) {
  if (csv.includes('�')) throw new Error('encoding');
  const [head, ...rows] = parseCsv(csv);
  if (!head) throw new Error('empty');
  const fields = head.cells.map((h) => Object.keys(headers).find((f) => headers[f].some((name) => norm(name) === norm(h))) ?? null);
  const missing = required.filter((f) => !fields.includes(f));
  if (missing.length) throw new Error(`columns:${missing.map((f) => headers[f][0]).join(', ')}`);
  return rows.map(({ line, cells }) => ({ line, ...Object.fromEntries(fields.map((f, i) => [f, cells[i] ?? '']).filter(([f]) => f)) }));
}
export const readPeople = (csv) => table(csv, PEOPLE_HEADERS, ['code', 'sex']);
export const readMarriages = (csv) => table(csv, MARRIAGE_HEADERS, ['husband', 'wife']);

const lookup = (groups) => (value) => Object.keys(groups).find((k) => groups[k].some((word) => norm(word) === norm(value))) ?? null;
export const readSex = lookup({ male: ['পুরুষ', 'ছেলে', 'male', 'm'], female: ['নারী', 'মহিলা', 'মেয়ে', 'স্ত্রী', 'female', 'f'], unknown: ['অজানা', 'unknown', ''] });
export const readLiving = lookup({ living: ['হ্যাঁ', 'জীবিত', 'yes', 'y', 'living'], deceased: ['না', 'মৃত', 'প্রয়াত', 'no', 'n', 'deceased'], unknown: ['', 'অজানা', 'unknown'] });
export const readRelation = lookup({ biological: ['', 'জৈবিক', 'নিজের', 'biological'], adoptive: ['দত্তক', 'adoptive', 'adopted'], foster: ['পালিত', 'foster'] });
export const readMarriageStatus = lookup({
  ongoing: ['বিবাহিত', 'চলমান', 'ongoing', 'married'], divorced: ['তালাক', 'divorced'], widowed: ['মৃত্যুতে সমাপ্ত', 'মৃত্যু', 'widowed'],
  separated: ['পৃথক', 'separated'], annulled: ['বাতিল', 'annulled'], unknown: ['', 'অজানা', 'unknown'],
});

/**
 * "1952" · "1952-08" · "1952-08-14" · "14/08/1952" · "~1880" (about) ·
 * "<1900" · ">1947" · "1880..1885". Bangla digits too. Blank or "?" = unknown.
 * Throws when it cannot be understood: dates are never guessed.
 */
export function readDate(value) {
  const s = asciiDigits(value ?? '').trim();
  if (s === '' || s === '?' || s === 'অজানা') return null;
  const point = (t) => {
    let m = t.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
    if (m) return { year: +m[1], ...(m[2] ? { month: +m[2] } : {}), ...(m[3] ? { day: +m[3] } : {}) };
    m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);      // day/month/year
    if (m) return { year: +m[3], month: +m[2], day: +m[1] };
    throw new Error('date');
  };
  const range = s.split(/\s*\.\.\s*/);
  if (range.length === 2) {
    const a = point(range[0]);
    const b = point(range[1]);
    return { qualifier: 'between', ...a, year_to: b.year, ...(b.month ? { month_to: b.month } : {}), ...(b.day ? { day_to: b.day } : {}) };
  }
  for (const [re, qualifier] of [[/^(?:~|আনুমানিক|আনু\.?)\s*/, 'about'], [/^<\s*/, 'before'], [/^>\s*/, 'after']]) {
    if (re.test(s)) return { qualifier, ...point(s.replace(re, '')) };
  }
  return { qualifier: 'exact', ...point(s) };
}
