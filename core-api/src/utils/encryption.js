import crypto from 'crypto';
import config from '../config/config.js';

// Default key for development only - in production this must be set in env
const DEFAULT_KEY = '00112233445566778899aabbccddeeff';
const ALGORITHM = 'aes-256-cbc';

// Get key from config or env, fallback to default for dev
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || DEFAULT_KEY;
const IV_LENGTH = 16; // For AES, this is always 16

if (ENCRYPTION_KEY.length !== 32) {
    console.warn(`[WARN] ENCRYPTION_KEY should be 32 characters! Current length: ${ENCRYPTION_KEY.length}`);
}

export const encrypt = (text) => {
    if (!text) return text;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
};

export const decrypt = (text) => {
    if (!text) return text;

    const textParts = text.split(':');
    if (textParts.length !== 2) return text; // Not encrypted or invalid format

    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
};
