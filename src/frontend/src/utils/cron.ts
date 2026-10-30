/**
 * Plain-English descriptions of 5-field cron expressions.
 *
 * Mirrors the grammar ScheduleManager.php accepts: `*`, `*\/N`, `N`, `A-B`,
 * `A-B/N`, and comma lists of those. It also mirrors one non-standard rule:
 * the backend requires day-of-month AND day-of-week to match, where standard
 * cron runs when either does, so the description says "only if".
 *
 * Anything this cannot phrase falls back to `Cron: <expr>` rather than a
 * description that silently drops a field.
 */

type Segment =
  | { kind: 'all'; step: number }
  | { kind: 'range'; lo: number; hi: number; step: number }
  | { kind: 'value'; value: number };

const FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0 and 7 = Sunday)
];

export const DAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

function parseField(field: string, min: number, max: number): Segment[] | null {
  const segments: Segment[] = [];
  for (const raw of field.split(',')) {
    const m = /^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(raw);
    if (!m) return null;
    const step = m[3] === undefined ? 1 : Number(m[3]);
    if (step < 1) return null;
    if (m[1] === undefined) {
      segments.push({ kind: 'all', step });
      continue;
    }
    const lo = Number(m[1]);
    if (lo < min || lo > max) return null;
    if (m[2] === undefined) {
      // "N/S" is shorthand for "N-<max>/S": "0/3" is every 3rd minute from 0.
      if (m[3] === undefined) segments.push({ kind: 'value', value: lo });
      else segments.push({ kind: 'range', lo, hi: max, step });
      continue;
    }
    const hi = Number(m[2]);
    if (hi > max || lo > hi) return null;
    segments.push({ kind: 'range', lo, hi, step });
  }
  return segments;
}

function isAny(segments: Segment[]): boolean {
  return segments.length === 1 && segments[0].kind === 'all' && segments[0].step === 1;
}

function numbersOf(segments: Segment[]): number[] | null {
  if (!segments.every((s) => s.kind === 'value')) return null;
  return segments.map((s) => (s as { value: number }).value);
}

function singleStep(segments: Segment[]): number | null {
  const [s] = segments;
  return segments.length === 1 && s.kind === 'all' && s.step > 1 ? s.step : null;
}

function joinList(items: string[], conjunction = '和'): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join('、')} ${conjunction} ${items[items.length - 1]}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Names for value and plain-range segments ("Monday", "Monday through Friday").
 * Returns null for any stepped segment.
 */
function listNamed(segments: Segment[], name: (n: number) => string): string[] | null {
  const items: string[] = [];
  for (const s of segments) {
    if (s.kind === 'value') items.push(name(s.value));
    else if (s.kind === 'range' && s.step === 1) items.push(`${name(s.lo)} 至 ${name(s.hi)}`);
    else return null;
  }
  return items;
}

// Each clause describer returns '' for "no restriction" and null for
// "cannot describe", which sends the whole expression to the fallback.

function describeMinutes(segments: Segment[]): string | null {
  const [s] = segments;
  if (segments.length === 1 && s.kind === 'all') {
    return s.step === 1 ? '每分钟' : `每 ${s.step} 分钟`;
  }
  if (segments.length === 1 && s.kind === 'range') {
    const every = s.step === 1 ? '每分钟' : `每 ${s.step} 分钟`;
    return `${every}（从第 ${s.lo} 到第 ${s.hi} 分钟）`;
  }
  const minutes = numbersOf(segments);
  if (!minutes) return null;
  return `在 ${joinList(minutes.map(String))} 分钟`;
}

function describeHours(segments: Segment[]): string | null {
  const [s] = segments;
  const step = singleStep(segments);
  if (step) return `每 ${step} 小时`;
  if (segments.length === 1 && s.kind === 'range') {
    const between = `在 ${pad(s.lo)}:00 到 ${pad(s.hi)}:59 之间`;
    return s.step === 1 ? between : `每 ${s.step} 小时（${between}）`;
  }
  const hours = numbersOf(segments);
  if (!hours) return null;
  return `在 ${joinList(hours.map((h) => `${pad(h)}:00`))}`;
}

function describeTime(min: Segment[], hour: Segment[]): string | null {
  const minutes = numbersOf(min);
  const hours = numbersOf(hour);

  // Fixed clock times. Past a handful, a list stops being readable.
  if (minutes && hours) {
    if (minutes.length * hours.length > 6) return null;
    return `在 ${joinList(hours.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`)))}`;
  }

  const onTheHour = minutes?.length === 1 && minutes[0] === 0;
  if (isAny(hour)) {
    if (onTheHour) return '每小时';
    return minutes ? `${describeMinutes(min)}（每小时）` : describeMinutes(min);
  }

  const hourStep = singleStep(hour);
  if (onTheHour && hourStep) return `每 ${hourStep} 小时`;

  const minutePhrase = describeMinutes(min);
  const hourPhrase = describeHours(hour);
  if (!minutePhrase || !hourPhrase) return null;
  return `${minutePhrase} ${hourPhrase}`;
}

function describeMonthDays(segments: Segment[]): string | null {
  if (isAny(segments)) return '';
  const step = singleStep(segments);
  if (step) return `每月第 ${step} 天`;
  const items = listNamed(segments, String);
  if (!items) return null;
  return `在每月 ${joinList(items)} 日`;
}

function describeMonths(segments: Segment[]): string | null {
  if (isAny(segments)) return '';
  const step = singleStep(segments);
  if (step) return `每 ${step} 个月`;
  const items = listNamed(segments, (n) => MONTH_NAMES[n - 1]);
  return items ? `在 ${joinList(items)}` : null;
}

function weekdayNames(segments: Segment[]): string[] | null {
  if (isAny(segments)) return [];
  return listNamed(segments, (n) => DAY_NAMES[n % 7]);
}

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return '无效的表达式';

  const fields = parts.map((p, i) => parseField(p, ...FIELD_RANGES[i]));
  if (fields.some((f) => f === null)) return '无效的表达式';
  const [min, hour, dom, mon, dow] = fields as Segment[][];

  const time = describeTime(min, hour);
  const monthDays = describeMonthDays(dom);
  const months = describeMonths(mon);
  const weekdays = weekdayNames(dow);
  if (time === null || monthDays === null || months === null || weekdays === null) {
    return `Cron：${expr.trim()}`;
  }

  const clauses = [time];
  if (monthDays && weekdays.length) clauses.push(`${monthDays}，仅当是 ${joinList(weekdays, '或')}`);
  else if (monthDays) clauses.push(monthDays);
  else if (weekdays.length) clauses.push(`在 ${joinList(weekdays)}`);
  if (months) clauses.push(months);

  if (clauses.length === 1 && /^在 \d/.test(time)) return `每天 ${time} 运行`;
  return `${clauses.join(' ')} 运行`;
}
