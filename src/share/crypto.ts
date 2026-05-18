import type { Bytes } from './base64';

const PBKDF2_ITERATIONS = 250_000;
const SALT_LEN = 16;
const IV_LEN = 12;

export function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKey(password: string, salt: Bytes): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(password) as Bytes;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  ciphertext: Bytes;
  salt: Bytes;
  iv: Bytes;
}

export async function encrypt(plaintext: Bytes, password: string): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext: new Uint8Array(ct), salt, iv };
}

export async function decrypt(
  ciphertext: Bytes,
  password: string,
  salt: Bytes,
  iv: Bytes,
): Promise<Bytes> {
  const key = await deriveKey(password, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(pt);
}
