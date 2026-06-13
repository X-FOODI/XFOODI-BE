import crypto from 'crypto';
import { ENV } from '../config/env';

const IV_LENGTH = 16;

function getKey(): Buffer {
  const key = ENV.DOCUMENT_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plain-text string using AES-256-CBC.
 * Returns a string in the format: "base64(iv):base64(ciphertext)"
 */
export function encryptValue(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a string that was encrypted with encryptValue().
 * Input format: "base64(iv):base64(ciphertext)"
 */
export function decryptValue(encryptedText: string): string {
  const [ivBase64, dataBase64] = encryptedText.split(':');
  if (!ivBase64 || !dataBase64) {
    throw new Error('Invalid encrypted value format');
  }
  const iv = Buffer.from(ivBase64, 'base64');
  const data = Buffer.from(dataBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
