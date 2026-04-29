import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';

const PASSWORD_KEY_LENGTH = 64;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const hashPassword = (password: string, salt = randomBytes(16).toString('hex')) => {
    const passwordHash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');

    return {
        salt,
        passwordHash
    };
};

export const verifyPassword = (password: string, salt: string, expectedHash: string): boolean => {
    const derivedHash = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
    const expectedHashBuffer = Buffer.from(expectedHash, 'hex');

    if (derivedHash.length !== expectedHashBuffer.length) {
        return false;
    }

    return timingSafeEqual(derivedHash, expectedHashBuffer);
};

export const createSessionToken = (): string => randomBytes(32).toString('base64url');

export const hashSessionToken = (token: string): string => createHash('sha256').update(token).digest('hex');
