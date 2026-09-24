// The letters are transcribed from the supplied 2026–27 school calendar.
// They are deliberately not calculated by incrementing a six-day counter:
// published dates include repeats and jumps during special arrangements.
const printed = {
  '2026-09': '2A 3A 4B 7B 8C 9D 10E 11F 14A 15B 16C 17D 18E 21F 22A 23D 24B 25C 28E 29F 30A',
  '2026-10': '2B 5C 6D 7E 8F 9A 12B 13C 14D 15E 16F 20A 21B 22C 23D 26E 30F',
  '2026-11': '2A 3B 4C 5D 6E 9F 10A 11B 12C 18D 19E 20F 23A 24B 25C 26D 27E 30F',
  '2026-12': '1A 2B 3C 4D 7E 8F 9A 10B 11C 14D 15E 16F 17A 18B',
  '2027-01': '4C 5D 6E 7F 8A 11B 12C 13D 14E 15F 18A 19B 20C 21D 22E 25F 26A 27B 28C 29E',
  '2027-02': '1D'
};

export const LAST_S6_DAY = '2027-02-01';
export const FIRST_DAY = '2026-09-01';
export const cycleByDate = Object.fromEntries(Object.entries(printed).flatMap(([month, entries]) =>
  entries.split(' ').map(entry => [`${month}-${entry.slice(0, -1).padStart(2, '0')}`, entry.at(-1)])));

const special = new Map([
  ['2026-09-01', ['opening', 'School opening ceremony · timetable unavailable']],
  ...['2026-09-02','2026-09-03','2026-09-04','2026-09-07'].map(date => [date, ['special', 'Special timetable · lessons need confirmation']]),
  ['2026-09-22', ['regular', "Students' Union election · check lesson changes"]],
  ['2026-09-23', ['regular', "Students' Union election · check lesson changes"]],
  ['2026-09-24', ['regular', 'Students’ Union AGM · check lesson changes']],
  ['2026-10-01', ['holiday', 'National Day']],
  ['2026-10-19', ['holiday', 'Chung Yeung Festival following day']],
  ...['2026-10-20','2026-10-21','2026-10-22','2026-10-23'].map(date => [date, ['exam', 'S6 test week · exam timetable needed']]),
  ['2026-10-27', ['special', 'Athletics meet (heat) · no ordinary timetable']],
  ['2026-10-28', ['special', 'Athletics meet (final) · no ordinary timetable']],
  ['2026-10-29', ['holiday', 'Day following athletics meet']],
  ['2026-11-13', ['holiday', 'Staff development day']],
  ['2026-11-16', ['special', 'School picnic day · no ordinary timetable']],
  ['2026-11-17', ['holiday', 'Day following picnic']],
  ['2026-12-21', ['special', 'Christmas celebration · no ordinary timetable']],
  ['2027-01-01', ['holiday', 'New Year’s Day']],
  ['2027-02-01', ['regular', 'S6 last school day · check final arrangements']]
]);
for (let n = Date.UTC(2026, 11, 22); n <= Date.UTC(2027, 0, 2); n += 86400000) {
  special.set(new Date(n).toISOString().slice(0, 10), ['holiday', 'Christmas and New Year holiday']);
}
for (let n = Date.UTC(2027, 0, 4); n <= Date.UTC(2027, 0, 21); n += 86400000) {
  const date = new Date(n).toISOString().slice(0, 10);
  if (cycleByDate[date]) special.set(date, ['exam', 'S6 mock examinations · exam timetable needed']);
}

const codes = {
  ECON: ['Economics', 'NPY', '413'], GEOG: ['Geography', 'CK', 'GER'],
  ICT: ['ICT', 'MKM', '413'], ENG: ['English', 'LML', '413'],
  CHIN: ['Chinese', 'HYW', '413'], MATH: ['Mathematics', 'FNY', '413'],
  CSD: ['Citizenship and Social Development', 'LHT', '413'],
  PE: ['PE', 'CTL / NSM', 'PLG'], OLE: ['OLE', 'LML', ''], CTP: ['CTP', 'LML', '413']
};
export const subjects = codes;
export const timetable = {
  A: ['ECON','ECON','ICT','CHIN','CSD','ENG','ENG','CTP'],
  B: ['GEOG','ECON','ECON','CHIN','CHIN','MATH','ICT','ICT'],
  C: ['ENG','ENG','CSD','GEOG','GEOG','MATH','PE','PE'],
  D: ['ENG','ECON','MATH','CHIN','CHIN','ICT','OLE','OLE'],
  E: ['ECON','CHIN','CSD','GEOG','GEOG','ENG','MATH','MATH'],
  F: ['MATH','MATH','CHIN','ENG','ENG','GEOG','ICT','ICT']
};
export const periodTimes = {
  summer: [['08:15','08:50'],['08:50','09:25'],['09:25','10:00'],['10:15','10:50'],['10:50','11:25'],['11:40','12:15'],['12:15','12:50'],['12:50','13:25']],
  winter: [['08:15','09:00'],['09:00','09:45'],['09:45','10:30'],['10:45','11:30'],['11:30','12:15'],['13:25','14:10'],['14:10','14:55'],['14:55','15:40']]
};

export function dayInfo(date, overrides = {}) {
  if (date > LAST_S6_DAY) return { date, type: 'finished', label: 'S6 finished · last school day was 1 February', cycle: null };
  if (date < FIRST_DAY) return { date, type: 'outside', label: 'Before the S6 timetable begins', cycle: null };
  const cycle = overrides[date]?.cycle ?? cycleByDate[date] ?? null;
  const [type, label] = special.get(date) ?? (cycle ? ['regular', 'Normal timetable'] : ['off', 'No S6 lessons published']);
  return { date, type: overrides[date]?.type ?? type, label: overrides[date]?.label || label, cycle };
}

export function lessonsOn(date, overrides = {}) {
  const day = dayInfo(date, overrides);
  if (day.type !== 'regular' || !day.cycle || !timetable[day.cycle]) return [];
  return timetable[day.cycle].map((subject, index) => ({
    date, cycle: day.cycle, period: index + 1, subject,
    name: codes[subject][0], teacher: codes[subject][1],
    room: subject === 'ICT' && day.cycle !== 'B' ? 'CAL' : codes[subject][2]
  }));
}

export function addDays(date, amount) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function nextLesson(subject, afterDate, overrides = {}) {
  for (let date = addDays(afterDate, 1); date <= LAST_S6_DAY; date = addDays(date, 1)) {
    const match = lessonsOn(date, overrides).find(lesson => lesson.subject === subject);
    if (match) return match;
  }
  return null;
}

export function resolveHomework(homework, overrides = {}) {
  // Store the rule, not a date: an override will recalculate this occurrence.
  return { ...homework, due: nextLesson(homework.subject, homework.afterDate, overrides) };
}
