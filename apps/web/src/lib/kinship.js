// Kinship terms from the API's relationship description (see
// apps/api/src/modules/relationships/kinship.js). Bangla distinguishes the
// paternal/maternal side and the sex of the connecting relative.

const g = (sex, male, female, other) => (sex === 'male' ? male : sex === 'female' ? female : other);

function bnBlood(r) {
  const paternal = r.side !== 'maternal';
  switch (r.key) {
    case 'self': return 'নিজে';
    case 'ancestor': {
      const n = r.generationsA;
      if (n === 1) return g(r.sex, 'বাবা', 'মা', 'মা/বাবা');
      const base = paternal ? g(r.sex, 'দাদা', 'দাদি', 'দাদা/দাদি') : g(r.sex, 'নানা', 'নানি', 'নানা/নানি');
      return `${'পর'.repeat(n - 2)}${base}`;
    }
    case 'descendant': {
      const n = r.generationsB;
      if (n === 1) return g(r.sex, 'ছেলে', 'মেয়ে', 'সন্তান');
      if (n === 2) return g(r.sex, 'নাতি', 'নাতনি', 'নাতি/নাতনি');
      return `${'পর'.repeat(n - 3)}${g(r.sex, 'পুতি', 'পুতনি', 'পুতি')}`;
    }
    case 'sibling': return g(r.sex, 'ভাই', 'বোন', 'ভাই/বোন');
    case 'pibling': {
      if (r.generationsA === 2) {
        return paternal ? g(r.sex, 'চাচা', 'ফুপু', 'চাচা/ফুপু') : g(r.sex, 'মামা', 'খালা', 'মামা/খালা');
      }
      const elder = `${'পর'.repeat(r.generationsA - 3)}${paternal ? 'দাদা-দাদির' : 'নানা-নানির'}`;
      return `${elder} ${g(r.sex, 'ভাই', 'বোন', 'ভাই/বোন')}`;
    }
    case 'nibling': {
      const viaBrother = r.viaSex !== 'female';
      if (r.generationsB === 2) {
        return viaBrother ? g(r.sex, 'ভাতিজা', 'ভাতিজি', 'ভাতিজা/ভাতিজি') : g(r.sex, 'ভাগ্নে', 'ভাগ্নি', 'ভাগ্নে/ভাগ্নি');
      }
      return `${viaBrother ? 'ভাইয়ের' : 'বোনের'} ${g(r.sex, 'নাতি', 'নাতনি', 'নাতি/নাতনি')}`;
    }
    case 'cousin': {
      const sibling = g(r.sex, 'ভাই', 'বোন', 'ভাই/বোন');
      if (r.degree === 1 && r.removed === 0) {
        const prefix = paternal ? (r.viaSex === 'female' ? 'ফুপাতো' : 'চাচাতো') : (r.viaSex === 'female' ? 'খালাতো' : 'মামাতো');
        return `${prefix} ${sibling}`;
      }
      return `দূর সম্পর্কের আত্মীয় (${r.degree}-স্তরের কাজিন${r.removed ? `, ${r.removed} প্রজন্ম ব্যবধান` : ''})`;
    }
    default: return 'আত্মীয়';
  }
}

// Spouse of a blood relative: well-known Bangla terms first.
function bnSpouseOf(viaTerm, sex) {
  const special = {
    ছেলে: 'পুত্রবধূ (ছেলের বউ)', মেয়ে: 'জামাই', ভাই: 'ভাবি', বোন: 'দুলাভাই', চাচা: 'চাচি', মামা: 'মামি',
    ফুপু: 'ফুপা', খালা: 'খালু', ভাতিজা: 'ভাতিজার বউ', ভাগ্নে: 'ভাগ্নে-বউ', নাতি: 'নাতবউ', নাতনি: 'নাতজামাই',
    দাদা: 'দাদি (দাদার স্ত্রী)', নানা: 'নানি (নানার স্ত্রী)', বাবা: 'সৎ মা', মা: 'সৎ বাবা',
  };
  return special[viaTerm] ?? `${viaTerm}-এর ${g(sex, 'স্বামী', 'স্ত্রী', 'স্বামী/স্ত্রী')}`;
}

function bnRelativeOfSpouse(viaTerm, spouseSex) {
  const spouse = g(spouseSex, 'স্বামীর', 'স্ত্রীর', 'স্বামী/স্ত্রীর');
  if (viaTerm === 'বাবা') return 'শ্বশুর';
  if (viaTerm === 'মা') return 'শাশুড়ি';
  if (viaTerm === 'ছেলে' || viaTerm === 'মেয়ে') return `সৎ ${viaTerm}`;
  return `${spouse} ${viaTerm}`;
}

function enBlood(r) {
  const side = r.side ? ` (${r.side})` : '';
  const greats = (n) => 'great-'.repeat(Math.max(0, n));
  switch (r.key) {
    case 'self': return 'yourself';
    case 'ancestor':
      if (r.generationsA === 1) return g(r.sex, 'father', 'mother', 'parent');
      return `${greats(r.generationsA - 2)}grand${g(r.sex, 'father', 'mother', 'parent')}${side}`;
    case 'descendant':
      if (r.generationsB === 1) return g(r.sex, 'son', 'daughter', 'child');
      return `${greats(r.generationsB - 2)}grand${g(r.sex, 'son', 'daughter', 'child')}`;
    case 'sibling': return g(r.sex, 'brother', 'sister', 'sibling');
    case 'pibling': return `${greats(r.generationsA - 3)}${r.generationsA > 2 ? 'grand-' : ''}${g(r.sex, 'uncle', 'aunt', 'uncle/aunt')}${side}`;
    case 'nibling': return `${greats(r.generationsB - 3)}${r.generationsB > 2 ? 'grand-' : ''}${g(r.sex, 'nephew', 'niece', 'nephew/niece')}`;
    case 'cousin': {
      const ord = ['', 'first', 'second', 'third', 'fourth', 'fifth'][r.degree] ?? `${r.degree}th`;
      const removed = r.removed === 0 ? '' : r.removed === 1 ? ' once removed' : r.removed === 2 ? ' twice removed' : ` ${r.removed} times removed`;
      return `${ord} cousin${removed}${r.degree === 1 && !r.removed ? side : ''}`;
    }
    default: return 'relative';
  }
}

/** Human-readable relationship of B to A, e.g. "চাচাতো ভাই" / "first cousin (paternal)". */
export function kinshipTerm(r, lang) {
  if (!r) return '';
  const bn = lang === 'bn';
  switch (r.kind) {
    case 'self': return bn ? 'নিজে' : 'yourself';
    case 'blood': return bn ? bnBlood(r) : enBlood(r);
    case 'spouse': return bn ? g(r.sex, 'স্বামী', 'স্ত্রী', 'স্বামী/স্ত্রী') : g(r.sex, 'husband', 'wife', 'spouse');
    case 'spouse_of_relative':
      return bn ? bnSpouseOf(bnBlood(r.via), r.sex) : `${g(r.sex, 'husband', 'wife', 'spouse')} of your ${enBlood(r.via)}`;
    case 'relative_of_spouse':
      return bn
        ? bnRelativeOfSpouse(bnBlood(r.via), r.viaPerson?.sex)
        : `your ${g(r.viaPerson?.sex, 'husband', 'wife', 'spouse')}'s ${enBlood(r.via)}`;
    default: return bn ? 'রেকর্ডে কোনো সম্পর্ক পাওয়া যায়নি' : 'No recorded relationship found';
  }
}
