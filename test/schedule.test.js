import test from 'node:test';
import assert from 'node:assert/strict';
import {cycleByDate, dayInfo, lessonsOn, nextLesson, resolveHomework} from '../src/schedule.js';

test('published letters override an inferred six-day progression', () => {
  assert.equal(cycleByDate['2026-09-22'], 'A');
  assert.equal(cycleByDate['2026-09-23'], 'D');
  assert.equal(cycleByDate['2026-09-24'], 'B');
  assert.equal(cycleByDate['2027-01-29'], 'E');
  assert.equal(cycleByDate['2027-02-01'], 'D');
});
test('personal electives appear in the correct periods', () => {
  assert.deepEqual(lessonsOn('2026-09-25').map(l => l.subject), ['ENG','ENG','CSD','GEOG','GEOG','MATH','PE','PE']);
  assert.deepEqual(lessonsOn('2026-10-02').map(l => l.subject), ['GEOG','ECON','ECON','CHIN','CHIN','MATH','ICT','ICT']);
});
test('exams, special days, holidays and S6 cutoff suppress ordinary lessons', () => {
  for (const date of ['2026-09-03','2026-10-01','2026-10-20','2026-11-16','2027-01-04','2027-02-02']) assert.deepEqual(lessonsOn(date), []);
  assert.equal(lessonsOn('2026-09-24')[0].subject, 'GEOG');
  assert.equal(dayInfo('2027-02-02').type, 'finished');
});
test('homework tracks the next actual lesson when a school day is cancelled', () => {
  const homework = {subject:'ECON',afterDate:'2026-10-02',title:'Worksheet'};
  assert.equal(resolveHomework(homework).due.date, '2026-10-06');
  assert.equal(resolveHomework(homework, {'2026-10-06':{type:'holiday'}}).due.date, '2026-10-07');
  assert.equal(nextLesson('ECON','2027-02-01'),null);
});
