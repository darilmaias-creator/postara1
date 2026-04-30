const crypto = require('crypto');

const getSecret = () => {
    const secret = process.env.POSTARA_SOCIAL_SECRET || process.env.SOCIAL_TOKEN_SECRET;

    if (!secret) {
        throw new Error('A variável POSTARA_SOCIAL_SECRET não foi configurada.');
    }

    return secret;
};

const getKey = () => crypto.createHash('sha256').update(getSecret()).digest();

const encryptText = (plainText) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join('.');
};

const decryptText = (encryptedPayload) => {
    const [ivPart, authTagPart, encryptedPart] = String(encryptedPayload || '').split('.');

    if (!ivPart || !authTagPart || !encryptedPart) {
        throw new Error('Token social armazenado em formato inválido.');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        getKey(),
        Buffer.from(ivPart, 'base64url')
    );

    decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedPart, 'base64url')),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
};

const signState = (payload) => {
    const serializedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = crypto
        .createHmac('sha256', getSecret())
        .update(serializedPayload)
        .digest('base64url');

    return `${serializedPayload}.${signature}`;
};

const verifyState = (signedState) => {
    const [serializedPayload, signature] = String(signedState || '').split('.');

    if (!serializedPayload || !signature) {
        throw new Error('State OAuth inválido.');
    }

    const expectedSignature = crypto
        .createHmac('sha256', getSecret())
        .update(serializedPayload)
        .digest('base64url');

    const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
    );

    if (!isValid) {
        throw new Error('Assinatura do state OAuth inválida.');
    }

    return JSON.parse(Buffer.from(serializedPayload, 'base64url').toString('utf8'));
};

module.exports = {
    decryptText,
    encryptText,
    signState,
    verifyState
};
