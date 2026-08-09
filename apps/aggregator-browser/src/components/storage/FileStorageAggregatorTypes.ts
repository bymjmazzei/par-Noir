export interface FileStorageAggregatorProps {
  authenticatedUser?: {
    id: string;
    pnName?: string;
    publicKey?: string;
    nickname?: string;
    accessToken?: string;
  } | null;
  hideSecureFolderSection?: boolean;
  onOpenTextEditor?: (accountId: string) => void;
  /** Called when content is written to the public index (publish / share public / collection). */
  onUploadComplete?: (contentClass?: 'media' | 'thought' | 'collection') => void;
}
