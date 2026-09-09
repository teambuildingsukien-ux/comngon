/**
 * 🔐 Gemini API Key Encryption — AES-256-GCM
 * Mã hóa/giải mã key tenant trước khi lưu/đọc từ DB.
 *
 * Env cần thiết: GEMINI_MASTER_KEY (64 hex chars = 32 bytes)
 * Tạo key: node -e "require('crypto').randomBytes(32).toString('hex')"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_PREFIX = 'aes256gcm:';

/**
 * Lấy master key từ env — throw nếu chưa set.
 */
function getMasterKey(): Buffer {
    const key = process.env.GEMINI_MASTER_KEY;
    if (!key || key.length !== 64) {
        throw new Error('GEMINI_MASTER_KEY chưa được cấu hình hoặc không đúng 64 ký tự hex.');
    }
    return Buffer.from(key, 'hex');
}

/**
 * Mã hóa plaintext thành chuỗi AES-256-GCM.
 * Format: aes256gcm:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 */
export function encryptApiKey(plaintext: string): string {
    const masterKey = getMasterKey();
    const iv = randomBytes(12); // GCM chuẩn: 12 bytes
    const cipher = createCipheriv(ALGORITHM, masterKey, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag(); // 16 bytes GCM auth tag

    return `${KEY_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Giải mã chuỗi AES-256-GCM → plaintext.
 * Tự động detect format cũ (base64) để backward compatibility.
 */
export function decryptApiKey(encoded: string): string {
    // Format mới: aes256gcm:iv:authTag:ciphertext
    if (encoded.startsWith(KEY_PREFIX)) {
        const masterKey = getMasterKey();
        const parts = encoded.slice(KEY_PREFIX.length).split(':');
        if (parts.length !== 3) throw new Error('Invalid encrypted key format');

        const [ivB64, authTagB64, ciphertextB64] = parts;
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');
        const ciphertext = Buffer.from(ciphertextB64, 'base64');

        const decipher = createDecipheriv(ALGORITHM, masterKey, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }

    // Format cũ: base64 (legacy backward compat)
    return Buffer.from(encoded, 'base64').toString('utf8');
}
