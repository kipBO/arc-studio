const FIELD_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
const WEEKDAY_INDEX = new Map(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => [day, index]));
//
function parseCronField(source, [minimum, maximum], fieldIndex) {
  const values = new Set();
  for (const segment of source.split(',')) {
    if (!segment) throw new Error('Cron fields cannot contain empty list items.');
    const [rangeSource, stepSource, ...extra] = segment.split('/');
    if (extra.length) throw new Error('A cron range can contain only one step value.');
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step < 1 || step > maximum - minimum + 1) throw new Error('Cron step values must be positive and fit within their field.');
    let start = minimum;
    let end = maximum;
    if (rangeSource !== '*') {
      const range = rangeSource.split('-');
      if (range.length > 2) throw new Error('Cron ranges must use start-end format.');
      start = Number(range[0]);
      end = range.length === 2 ? Number(range[1]) : start;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < minimum || end > maximum || start > end) throw new Error(`Cron field value must be between ${minimum} and ${maximum}.`);
    }
    for (let value = start; value <= end; value += step) values.add(fieldIndex === 4 && value === 7 ? 0 : value);
  }
  return { values, wildcard: source.split(',').some((item) => item.startsWith('*')) };
}

export function validateCron(expression, timeZone = 'UTC') {
  const fields = String(expression || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Use five cron fields: minute hour day-of-month month day-of-week.');
  const parsed = fields.map((field, index) => parseCronField(field, FIELD_RANGES[index], index));
  try { new Intl.DateTimeFormat('en', { timeZone }).format(new Date()); }
  catch { throw new Error(`“${timeZone}” is not a valid IANA time zone.`); }
  return parsed;
}

function zonedMinute(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    minute: Number(values.minute), hour: Number(values.hour), day: Number(values.day), month: Number(values.month),
    weekday: WEEKDAY_INDEX.get(values.weekday)
  };
}

export function matchesCron(expression, timeZone = 'UTC', date = new Date()) {
  const fields = validateCron(expression, timeZone);
  const current = zonedMinute(date, timeZone);
  const [minute, hour, day, month, weekday] = fields;
  const dayMatch = day.values.has(current.day);
  const weekdayMatch = weekday.values.has(current.weekday);
  const calendarMatch = day.wildcard ? weekdayMatch : weekday.wildcard ? dayMatch : dayMatch || weekdayMatch;
  return minute.values.has(current.minute) && hour.values.has(current.hour) && month.values.has(current.month) && calendarMatch;
}

export function startCronScheduler({ getGraphs, dispatch, onError = () => {} }) {
  const lastFiredMinute = new Map();
  const reportedErrors = new Map();
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const now = new Date();
    for (const graph of getGraphs() || []) {
      for (const node of graph.nodes || []) {
        if (node.type !== 'event_cron') continue;
        const key = `${graph.id}:${node.id}`;
        try {
          const expression = String(node.data?.cronExpression || '').trim();
          const timeZone = String(node.data?.timeZone || 'UTC').trim() || 'UTC';
          if (!matchesCron(expression, timeZone, now)) continue;
          const minuteKey = Math.floor(now.getTime() / 60_000);
          if (lastFiredMinute.get(key) === minuteKey) continue;
          lastFiredMinute.set(key, minuteKey);
          reportedErrors.delete(key);
          await dispatch(graph, node, { cronNodeId: node.id, scheduledAt: now.toISOString(), timeZone, cronExpression: expression });
        } catch (error) {
          const message = error?.message || String(error);
          if (reportedErrors.get(key) !== message) {
            reportedErrors.set(key, message);
            onError({ graph, node, error: message });
          }
        }
      }
    }
  };
  const timer = setInterval(() => { void tick(); }, 1000);
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
