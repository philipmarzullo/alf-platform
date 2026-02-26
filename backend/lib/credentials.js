import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16;  // 128 bits

/**
 * Get the encryption key from env. Returns a 32-byte Buffer.
 * Throws if not configured or wrong length.
 */
function getEncryptionKey() {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext credential with AES-256-GCM.
 * Returns a base64 string encoding: iv (12) + authTag (16) + ciphertext.
 */
export function encryptCredential(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded credential blob.
 * Expects format: iv (12) + authTag (16) + ciphertext.
 */
export function decryptCredential(base64Blob) {
  const key = getEncryptionKey();
  const packed = Buffer.from(base64Blob, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Return the last 4 characters of a key for display.
 */
export function getKeyHint(rawKey) {
  if (!rawKey || rawKey.length < 4) return '****';
  return rawKey.slice(-4);
}
