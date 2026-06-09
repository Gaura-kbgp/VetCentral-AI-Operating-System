/**
 * Date/time formatting utilities that respect user preferences
 * (timezone, dateFormat, timeFormat) from PreferencesContext.
 */

export type DateFormatPattern = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
export type TimeFormatPattern = '12h' | '24h';

export function formatDate(
  date: Date | string,
  pattern: DateFormatPattern = 'MM/DD/YYYY',
  timezone = 'America/New_York',
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const parts = new Intl.DateTimeFormat('en-US', {
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    timeZone: timezone,
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const m = get('month');
  const day = get('day');
  const y = get('year');

  switch (pattern) {
    case 'DD/MM/YYYY': return `${day}/${m}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${day}`;
    default:           return `${m}/${day}/${y}`;
  }
}

export function formatTime(
  date: Date | string,
  format: TimeFormatPattern = '12h',
  timezone = 'America/New_York',
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour:        'numeric',
    minute:      '2-digit',
    hour12:      format === '12h',
    timeZone:    timezone,
  }).format(d);
}

export function formatDateTime(
  date: Date | string,
  datePattern: DateFormatPattern = 'MM/DD/YYYY',
  timeFormat:  TimeFormatPattern = '12h',
  timezone = 'America/New_York',
): string {
  return `${formatDate(date, datePattern, timezone)} ${formatTime(date, timeFormat, timezone)}`;
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const now    = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1)   return 'just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHr  < 24)  return `${diffHr}h ago`;
  if (diffDay < 7)   return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
