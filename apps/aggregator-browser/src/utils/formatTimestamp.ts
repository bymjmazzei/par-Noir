/**
 * Format timestamp for media tiles
 * - First day: "1 hour ago", "5 hours ago"
 * - After one day: "2/5/25 2:15PM"
 */
export function formatTimestamp(date: Date | string | number): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  // If less than 24 hours, show hours ago
  if (diffDays < 1) {
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) {
        return 'just now';
      }
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    }
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }

  // After one day, show date format: "2/5/25 2:15PM"
  const month = then.getMonth() + 1;
  const day = then.getDate();
  const year = then.getFullYear().toString().slice(-2);
  const hours = then.getHours();
  const minutes = then.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');

  return `${month}/${day}/${year} ${displayHours}:${displayMinutes}${ampm}`;
}

