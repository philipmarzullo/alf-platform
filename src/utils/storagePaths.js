/**
 * Build a storage path for tenant documents.
 * Format: {tenantId}/{department}/{timestamp}_{sanitizedFileName}
 */
export function buildDocumentPath(tenantId, department, fileName) {
  const sanitized = fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
  const timestamp = Date.now();
  return `${tenantId}/${department}/${timestamp}_${sanitized}`;
}

/**
 * Format bytes into a human-readable string.
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
