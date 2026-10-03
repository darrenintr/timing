import { homeworkDueTime, homeworkSubjects, normalizeHomework, validDate } from './homework.js';
import { addDays, resolveHomework, subjects } from './schedule.js';

// Transport-neutral contract: adapters supply the active user's state, never a
// user ID from tool arguments. No AI SDK, network or storage dependency here.
export const createHomeworkAction = {
  name: 'createHomework',
  description: 'Add homework to Timing. Use a subject name or code and a title/description. Due dates use Asia/Hong_Kong; next lesson follows the school timetable.',
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      text: {type:'string', minLength:1, maxLength:2000, description:'A normal-language homework request.'},
      subject: {type:'string', description:'Subject name or timetable code, e.g. Economics, ICT or X1.'},
      title: {type:'string', maxLength:160},
      description: {type:'string', maxLength:160, description:'Alternative to title.'},
      dueDate: {type:'string', description:'YYYY-MM-DD, today, tomorrow, Monday, or next lesson; optionally at 4 PM.'},
      dueTime: {type:'string', description:'Optional Hong Kong time, HH:mm or 4 PM. Only for a specific date.'},
      dueMode: {type:'string', enum:['date', 'nextLesson']},
      afterDate: {type:'string', description:'Assigned date YYYY-MM-DD; defaults to today in Hong Kong.'},
      notes: {type:'string', maxLength:1000},
      reminderDays: {type:'integer', enum:[0,1,2,3,7]}
    },
    oneOf: [
      {required:['text'], not:{anyOf:['subject','title','description','dueDate','dueTime','dueMode','afterDate'].map(key => ({required:[key]}))}},
      {required:['subject'], not:{required:['text']}, anyOf:[{required:['title']},{required:['description']}]}
    ]
  }
};

export class HomeworkRequestError extends Error {
  constructor(code, message) { super(message); this.name = 'HomeworkRequestError'; this.code = code; }
}
const fail = (code, message) => { throw new HomeworkRequestError(code, message); };
const canonical = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const aliases = {econ:'ECON', maths:'MATH', math:'MATH', x1:'ECON', x2:'GEOG', x3:'ICT'};
for (const code of homeworkSubjects) {
  aliases[canonical(code)] = code;
  aliases[canonical(subjects[code][0])] = code;
}
function subjectCode(value) {
  const code = aliases[canonical(value)];
  if (!code) fail('invalid_subject', 'Choose a known subject name or timetable code.');
  return code;
}
function clock(value) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) fail('invalid_due', 'Use a time such as 16:00 or 4 PM.');
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) fail('invalid_due', 'Choose a valid due time.');
  if (match[3]) hour = hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
function deadline(value, today) {
  const text = canonical(value).replace(/[.!]$/, '');
  if (text === 'next lesson') return {dueMode:'nextLesson', dueDate:''};
  const match = /^(.*?)(?:\s+at\s+(.+)|t(\d{2}:\d{2}))?$/i.exec(text);
  const dateText = match[1];
  const dueTime = match[2] || match[3] ? clock(match[2] || match[3]) : '';
  let dueDate;
  if (validDate(dateText)) dueDate = dateText;
  else if (dateText === 'today') dueDate = today;
  else if (dateText === 'tomorrow') dueDate = addDays(today, 1);
  else if (weekdays.includes(dateText)) {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    // A bare weekday means the next occurrence, strictly after today.
    dueDate = addDays(today, (weekdays.indexOf(dateText) - weekday + 7) % 7 || 7);
  } else fail('invalid_due', 'Specify a date, today, tomorrow, a weekday, or next lesson.');
  return {dueMode:'date', dueDate, dueTime};
}

// Deliberately bounded English parsing for typed/voice requests. Arbitrary
// language understanding can be supplied by any assistant via structured args.
export function parseHomeworkRequest(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) fail('invalid_request', 'Enter a homework request of up to 2000 characters.');
  const request = text.trim().replace(/^(?:can|could|would)\s+you\s+/i, '')
    .replace(/^(?:please\s+)?(?:add|create|set)\s+(?:my\s+)?/i, '');
  const due = /^(.*?)\s*[,;]?\s+due\s+(.+?)\s*[.!]?$/i.exec(request);
  if (!due) fail('missing_due', 'Include when the homework is due, for example due next lesson.');
  const content = due[1].trim().replace(/[,;]$/, '').trim();
  const leading = /^(.+?)\s+homework(?:\s*[:\-]\s*|\s+)(.+)$/i.exec(content);
  const forSubject = /^homework\s+for\s+(.+?)\s*:\s*(.+)$/i.exec(content);
  const colon = /^(.+?)\s*:\s*(.+)$/.exec(content);
  const trailing = /^(.+?)\s+for\s+(.+)$/i.exec(content);
  if (leading) return {subject:leading[1], title:leading[2], dueDate:due[2]};
  if (forSubject) return {subject:forSubject[1], title:forSubject[2], dueDate:due[2]};
  if (colon) return {subject:colon[1], title:colon[2], dueDate:due[2]};
  if (trailing) return {subject:trailing[2], title:trailing[1], dueDate:due[2]};
  fail('invalid_request', 'Include a subject and homework description, for example Economics homework: finish questions 1–15, due Monday at 4 PM.');
}

/** Prepare one validated item against the active user's current data.
 * Returns a detached result; the application/adapter persists only created=true
 * through its existing storage/sync path. Duplicate retries return the saved ID.
 */
export function createHomework(request, {homework, overrides = {}, timeMode = 'summer', now = new Date()}) {
  const today = now.toLocaleDateString('en-CA', {timeZone:'Asia/Hong_Kong'});
  if (!validDate(today)) fail('invalid_context', 'Supply a valid current date.');
  if (!Array.isArray(homework) || !['summer','winter'].includes(timeMode)) fail('invalid_context', 'Supply the current homework and lesson-time setting.');
  let input = typeof request === 'string' ? {text:request} : request;
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_request', 'Supply a homework request.');
  const allowed = Object.keys(createHomeworkAction.inputSchema.properties);
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('invalid_request', 'The request contains unknown fields.');
  for (const [key, value] of Object.entries(input)) {
    if (key === 'reminderDays') {
      if (!['0','1','2','3','7'].includes(String(value)) || !['number','string'].includes(typeof value)) fail('invalid_request', 'Choose a valid reminder time.');
    } else if (typeof value !== 'string') fail('invalid_request', `${key} must be text.`);
  }
  if ('text' in input) {
    if (Object.keys(input).some(key => !['text','notes','reminderDays'].includes(key))) fail('invalid_request', 'Supply either text or structured homework fields.');
    const {text, ...extra} = input;
    input = {...parseHomeworkRequest(text), ...extra};
  }
  if (!input.subject?.trim()) fail('missing_subject', 'Specify the homework subject.');
  if (input.title && input.description && input.title.trim() !== input.description.trim()) fail('invalid_request', 'Supply one homework title or description.');
  if (input.dueMode && !['date','nextLesson'].includes(input.dueMode)) fail('invalid_due', 'Choose date or nextLesson.');
  let due;
  if (input.dueMode === 'nextLesson') {
    if (input.dueDate && canonical(input.dueDate) !== 'next lesson') fail('invalid_due', 'Next lesson cannot also have a fixed due date.');
    due = {dueMode:'nextLesson', dueDate:''};
  } else {
    if (!input.dueDate?.trim()) fail('missing_due', 'Specify a due date or next lesson.');
    due = deadline(input.dueDate, today);
    if (input.dueMode === 'date' && due.dueMode !== 'date') fail('invalid_due', 'The due date and due mode conflict.');
  }
  if (input.dueTime) {
    const time = clock(input.dueTime);
    if (due.dueMode !== 'date' || (due.dueTime && due.dueTime !== time)) fail('invalid_due', 'The due date and due time conflict.');
    due.dueTime = time;
  }
  let item;
  try {
    item = normalizeHomework({...input, ...due, subject:subjectCode(input.subject),
      title:input.title || input.description, afterDate:input.afterDate ?? today});
  } catch (error) {
    if (error instanceof HomeworkRequestError) throw error;
    fail('invalid_request', error.message);
  }
  const resolved = resolveHomework(item, overrides);
  const duplicate = homework.find(existing => {
    if (existing.subject !== item.subject || canonical(existing.title) !== canonical(item.title) ||
        (existing.notes ?? '').trim() !== item.notes) return false;
    const prior = resolveHomework(existing, overrides);
    return resolved.due ? prior.due?.date === resolved.due.date && homeworkDueTime(prior, timeMode) === homeworkDueTime(resolved, timeMode)
      : !prior.due && existing.dueMode === item.dueMode && existing.afterDate === item.afterDate;
  });
  if (!duplicate && !resolved.due) fail('no_next_lesson', 'No confirmed lesson before S6 ends. Choose a specific due date.');
  const result = duplicate ? resolveHomework(duplicate, overrides) : resolved;
  return {created:!duplicate, homework:structuredClone(result), dueTime:homeworkDueTime(result, timeMode), timeZone:'Asia/Hong_Kong'};
}
