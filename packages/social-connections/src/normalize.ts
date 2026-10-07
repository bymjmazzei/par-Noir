export function normalizePnId(id: string): string {
  return id.startsWith('pn-') ? id.slice(3) : id;
}

export function withPnPrefix(id: string): string {
  const norm = normalizePnId(id);
  return norm ? `pn-${norm}` : id;
}
