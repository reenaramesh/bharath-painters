export type WorkPhotoAsset = { uri: string; name?: string | null; mimeType?: string | null };
export type WorkPhotoStage = 'BEFORE' | 'PROGRESS' | 'AFTER';

export function createWorkPhotoUploadParts(scheduleId: number, asset: WorkPhotoAsset, stage: WorkPhotoStage, area: string, caption: string) {
  const extension = asset.mimeType?.split('/')[1]?.replace(/^jpeg$/, 'jpg') || 'jpg';
  return {
    fields: { schedule: String(scheduleId), stage, area: area.trim(), caption: caption.trim() },
    image: { uri: asset.uri, name: asset.name || `work-photo.${extension}`, type: asset.mimeType || 'image/jpeg' },
  };
}
