/**
 * Formatting utilities for container stats display.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${BYTE_UNITS[i] || 'B'}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** How loaded a CPU or memory percent is, for the stats bar and widget colors. */
export function loadLevel(percent: number): 'high' | 'medium' | 'low' {
  if (percent > 80) return 'high';
  if (percent > 50) return 'medium';
  return 'low';
}

/** Bar fill for each load level. Shared so the Folders page and the widget bars stay the same color. */
export const LOAD_BAR_CLASSES = { high: 'bg-error', medium: 'bg-warning', low: 'bg-success' } as const;

/**
 * Format a unix timestamp for display.
 *
 * When `timeZone` is given (e.g. the backend's `server_timezone`, since
 * schedules are entered and evaluated in server time), render in that zone
 * instead of the browser's own. An unrecognized zone throws a RangeError in
 * `toLocaleString`, so fall back to the browser-zone rendering rather than
 * blowing up the caller.
 */
export function formatTimestamp(unixSeconds: number, timeZone?: string | null): string {
  const date = new Date(unixSeconds * 1000);
  if (timeZone) {
    try {
      return date.toLocaleString(undefined, { timeZone });
    } catch {
      return date.toLocaleString();
    }
  }
  return date.toLocaleString();
}

/**
 * Time from now until `unixSeconds`, e.g. "in 8h 5m".
 *
 * The mirror of formatUptime, which counts backwards from a start time; this
 * counts forwards to a scheduled one. A time that has already passed reads
 * "due" rather than a negative duration — a schedule whose next run is in the
 * past is waiting on the cron runner, not overdue by a measurable amount.
 */
export function formatTimeUntil(unixSeconds: number): string {
  const diffMs = unixSeconds * 1000 - Date.now();
  if (diffMs <= 0) return '已到期';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `剩余 ${days}天 ${hours % 24}小时`;
  if (hours > 0) return `剩余 ${hours}小时 ${minutes % 60}分钟`;
  if (minutes > 0) return `剩余 ${minutes}分钟`;
  return '剩余不到 1 分钟';
}

export function formatDuration(startSec: number, endSec: number): string {
  const s = endSec - startSec;
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分钟 ${s % 60}秒`;
}

export type ScheduleRunStatus = 'success' | 'error' | 'skipped';

export function scheduleStatusClass(status: string): string {
  switch (status) {
    case 'success': return 'text-success';
    case 'error': return 'text-error';
    // A skipped run is not a failure. It means the runner found the schedule
    // too long after its slot and deliberately did not act.
    case 'skipped': return 'text-warning';
    default: return 'text-text-secondary';
  }
}

export function formatUptime(isoDate: string): string {
  if (!isoDate) return '无';
  const start = new Date(isoDate).getTime();
  const now = Date.now();
  const diffMs = now - start;
  if (diffMs < 0) return '无';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天 ${hours % 24}小时`;
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟`;
  return '不到 1 分钟';
}
