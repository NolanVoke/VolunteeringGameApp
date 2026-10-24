const sessionCookieName = 'volunteer_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

export const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers
    }
});

export const originError = (request) => {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) {
        return jsonResponse({ error: 'Request origin is not allowed.' }, 403);
    }
    return null;
};

const randomToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
};

export const hashToken = async (value) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const passwordHash = async (password, salt) => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: Uint8Array.from(salt.match(/.{2}/g), (byte) => Number.parseInt(byte, 16)),
        iterations: 100000
    }, key, 256);
    return [...new Uint8Array(derived)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashPassword = async (password) => {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = [...saltBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { salt, hash: await passwordHash(password, salt) };
};

export const verifyPassword = async (password, salt, expectedHash) => {
    const actualHash = await passwordHash(password, salt);
    let difference = actualHash.length ^ expectedHash.length;
    for (let index = 0; index < Math.max(actualHash.length, expectedHash.length); index += 1) {
        difference |= (actualHash.charCodeAt(index) || 0) ^ (expectedHash.charCodeAt(index) || 0);
    }
    return difference === 0;
};

export const createSession = async (accountId, env) => {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString();
    await env.DB.prepare('DELETE FROM account_sessions WHERE expires_at <= ?')
        .bind(new Date().toISOString()).run();
    await env.DB.prepare(`
        INSERT INTO account_sessions (token_hash, account_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
    `).bind(await hashToken(token), accountId, expiresAt, new Date().toISOString()).run();
    return `${sessionCookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}`;
};

export const clearSessionCookie = () =>
    `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export const getAccountForRequest = async (request, env) => {
    const token = request.headers.get('Cookie')
        ?.match(new RegExp(`(?:^|;\\s*)${sessionCookieName}=([^;]+)`))?.[1];
    if (!token) return null;
    const tokenHash = await hashToken(token);
    const row = await env.DB.prepare(`
        SELECT accounts.id, accounts.name, accounts.email
        FROM account_sessions
        JOIN accounts ON accounts.id = account_sessions.account_id
        WHERE account_sessions.token_hash = ? AND account_sessions.expires_at > ?
    `).bind(tokenHash, new Date().toISOString()).first();
    return row || null;
};
