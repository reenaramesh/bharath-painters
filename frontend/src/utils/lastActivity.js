export function formatLastActivity(value, timeZone) {
  if (!value) return 'No recorded activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No recorded activity';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short', ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
