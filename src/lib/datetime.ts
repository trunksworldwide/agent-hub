export function formatDateTime(value: Date | number | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  // Keep ClawdOS consistent: human-friendly month/day + 12h time.
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(value: Date | number | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Compact relative timestamps for feeds (e.g. “5m ago”).
// Pass a stable `now` (e.g. from a ticking state) to avoid re-render jitter.
export function formatRelativeTime(value: Date | number | string, now: Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const deltaMs = now.getTime() - d.getTime();
  if (!Number.isFinite(deltaMs)) return String(value);
  if (deltaMs < 0) return 'just now';

  const s = Math.floor(deltaMs / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;

  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;

  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;

  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
