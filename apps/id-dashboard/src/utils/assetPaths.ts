export const getAssetUrl = (relativePath: string): string => {
  const normalized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

  if (typeof window !== 'undefined') {
    const resolver = window.parNoirDesktop?.assets?.resolve;
    if (resolver) {
      return resolver(normalized);
    }
  }

  const baseUrl = import.meta.env.BASE_URL || '/';
  return `${baseUrl}${normalized}`;
};
