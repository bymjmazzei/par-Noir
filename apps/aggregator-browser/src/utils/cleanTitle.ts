/**
 * Clean file title for display
 * Removes "thumb_" prefix and file extensions
 */
export function cleanTitle(title: string | undefined | null): string {
  if (!title) return 'Untitled';
  
  let cleaned = title;
  
  // Remove "thumb_" prefix (case insensitive)
  cleaned = cleaned.replace(/^thumb_/i, '');
  
  // Remove file extensions (.encrypted, .jpg, .jpeg, .png, etc.)
  // But keep .thought extension for thoughts
  if (!cleaned.toLowerCase().endsWith('.thought') && !cleaned.toLowerCase().endsWith('.thought.encrypted')) {
    cleaned = cleaned.replace(/\.(encrypted|jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|webm|mkv|flv|wmv|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i, '');
  } else {
    // For thoughts, only remove .encrypted
    cleaned = cleaned.replace(/\.encrypted$/i, '');
  }
  
  return cleaned || 'Untitled';
}

