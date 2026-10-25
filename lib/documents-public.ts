export type OwnerKind = 'person' | 'placement';
export type Doc = {
  id: string; owner_kind: OwnerKind; owner_id: string;
  name: string; label: string | null; file_path: string; mime: string; bytes: number;
  uploaded_by: string | null; uploaded_at: string;
};
export const DOC_MAX_BYTES = 25 * 1024 * 1024;
export const DOC_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
export function docSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
