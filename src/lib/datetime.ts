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
