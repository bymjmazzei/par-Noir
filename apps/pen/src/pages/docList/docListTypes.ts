export type PenAddIntent = 'notebook' | 'templates' | 'my-templates' | 'blank';

export type DrillLevel = 'category' | 'form' | 'template';

export type ExplorerSortKey = 'name' | 'category' | 'form' | 'template' | 'updated';

export type ExplorerSort = {
  key: ExplorerSortKey;
  dir: 'asc' | 'desc';
};

export const DEFAULT_EXPLORER_SORT: ExplorerSort = { key: 'updated', dir: 'desc' };
