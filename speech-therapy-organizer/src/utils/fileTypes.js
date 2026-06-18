// Extensions the built-in viewer can render inline
export const VIEWER_EXTS = new Set(['pdf','jpg','jpeg','png','gif','bmp','webp','svg','mp4','mov','avi','webm','mp3','wav','m4a','ogg'])

// Extensions that need an external app to run properly
export const EXTERNAL_EXTS = new Set(['pptx','ppt','key','exe','swf','app','docx','doc','xlsx','xls'])

export const EXTERNAL_LABELS = {
  pptx: 'PowerPoint', ppt: 'PowerPoint',
  key:  'Keynote',
  exe:  'Windows App', swf: 'Flash',
  app:  'Mac App',
  docx: 'Word', doc: 'Word',
  xlsx: 'Excel', xls: 'Excel',
}

export function getExt(filePath) {
  if (!filePath) return ''
  return filePath.split('.').pop().toLowerCase()
}

export function isExternalFile(filePath) {
  return EXTERNAL_EXTS.has(getExt(filePath))
}

export function externalLabel(filePath) {
  return EXTERNAL_LABELS[getExt(filePath)] || 'External App'
}
