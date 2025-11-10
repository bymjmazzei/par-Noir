export const getAssetUrl = (path: string): string => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${baseUrl}${normalized}`;
};
