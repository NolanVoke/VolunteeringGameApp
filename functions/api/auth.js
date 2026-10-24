import {
    clearSessionCookie,
    createSession,
    getAccountForRequest,
    hashToken,
    hashPassword,
    jsonResponse,
    originError,
    randomToken,
    verifyPassword
} from './auth-helpers.js';

export async function onRequestPost({ request, env }) {
    const requestOriginError = originError(request);
    if (requestOriginError) return requestOriginError;
    if (!env.DB) return jsonResponse({ error: 'Accounts are not configured yet.' }, 503);

    const action = new URL(request.url).pathname.split('/').at(-1);
    if (action === 'verify') return verifyEmail(request, env);
    if (action === 'logout') {
        const account = await getAccountForRequest(request, env);
        if (account) {
            const token = request.headers.get('Cookie')
                ?.match(/(?:^|;\s*)volunteer_session=([^;]+)/)?.[1];
            if (token) {
                const tokenHash = await hashToken(token);
                await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?')
                    .bind(tokenHash).run();
            }
        }
        return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse({ error: 'Request body must be an account object.' }, 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
        || password.length < 10 || password.length > 128) {
        return jsonResponse({ error: 'Enter a valid email and a password between 10 and 128 characters.' }, 400);
    }

    let account;
    if (action === 'register') {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 80) {
            return jsonResponse({ error: 'Enter a name up to 80 characters.' }, 400);
        }
        if (!env.MAILJET_API_KEY || !env.MAILJET_SECRET_KEY
            || !env.MAILJET_FROM_EMAIL || !env.SITE_URL) {
            return jsonResponse({ error: 'Account email verification is not configured yet.' }, 503);
        }

        const existingAccount = await env.DB.prepare('SELECT id, email_verified_at FROM accounts WHERE email = ?')
            .bind(email).first();
        if (existingAccount) {
            const message = existingAccount.email_verified_at
                ? 'An account with this email already exists. Sign in instead.'
                : 'An account with this email is awaiting verification. Check your inbox.';
            return jsonResponse({ error: message }, 409);
        }

        const id = crypto.randomUUID();
        const { salt, hash } = await hashPassword(password);
        try {
            await env.DB.prepare(`
                INSERT INTO accounts (id, name, email, password_salt, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(id, name, email, salt, hash, new Date().toISOString()).run();
        } catch (error) {
            if (String(error?.message).includes('UNIQUE constraint failed: accounts.email')) {
                return jsonResponse({ error: 'An account with this email already exists. Sign in instead.' }, 409);
            }
            throw error;
        }
        const verificationToken = randomToken();
        await env.DB.prepare(`
            INSERT INTO account_email_verifications (token_hash, account_id, expires_at)
            VALUES (?, ?, ?)
        `).bind(await hashToken(verificationToken), id, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).run();

        let siteUrl;
        try {
            siteUrl = new URL(env.SITE_URL);
        } catch {
            await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
            return jsonResponse({ error: 'Account email verification is not configured yet.' }, 503);
        }
        if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password) {
            await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
            return jsonResponse({ error: 'Account email verification is not configured yet.' }, 503);
        }

        let emailResponse;
        try {
            emailResponse = await fetch('https://api.mailjet.com/v3.1/send', {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${btoa(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`)}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    Messages: [{
                        From: { Email: env.MAILJET_FROM_EMAIL, Name: 'Local Volunteering' },
                        To: [{ Email: email }],
                        Subject: 'Verify your Local Volunteering account',
                        TextPart: `Hi ${name},\n\nVerify your account within 24 hours:\n${new URL(`/verify.html?token=${encodeURIComponent(verificationToken)}`, siteUrl).href}\n\nIf you did not create this account, you can ignore this email.`
                    }]
                })
            });
        } catch (error) {
            await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
            console.error('Could not contact the email provider for account verification:', error);
            return jsonResponse({ error: 'Could not send the verification email. Please try again.' }, 502);
        }

        let emailResult;
        try {
            emailResult = await emailResponse.json();
        } catch (error) {
            await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
            console.error('Email provider returned an invalid account-verification response:', error);
            return jsonResponse({ error: 'Could not send the verification email. Please try again.' }, 502);
        }
        if (!emailResponse.ok || emailResult.Messages?.[0]?.Status !== 'success'
            || !emailResult.Messages[0].To?.some((recipient) => recipient.Email === email)) {
            await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
            console.error(`Email provider rejected account verification (${emailResponse.status}):`, JSON.stringify(emailResult));
            return jsonResponse({ error: 'Could not send the verification email. Please try again.' }, 502);
        }

        return jsonResponse({ verificationRequired: true }, 201);
    } else if (action === 'login') {
        const existingAccount = await env.DB.prepare(`
            SELECT id, name, email, password_salt, password_hash, email_verified_at
            FROM accounts WHERE email = ?
        `).bind(email).first();
        const passwordMatches = existingAccount
            ? await verifyPassword(password, existingAccount.password_salt, existingAccount.password_hash)
            : false;
        if (!passwordMatches) return jsonResponse({ error: 'Email or password is incorrect.' }, 401);
        if (!existingAccount.email_verified_at) {
            return jsonResponse({ error: 'Verify your email address before signing in. Check your inbox.' }, 403);
        }
        account = { id: existingAccount.id, name: existingAccount.name, email: existingAccount.email };
    } else {
        return jsonResponse({ error: 'Not found.' }, 404);
    }

    const sessionCookie = await createSession(account.id, env);
    return jsonResponse({ account }, 200, { 'Set-Cookie': sessionCookie });
}

async function verifyEmail(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!body || typeof body.token !== 'string' || !body.token) {
        return jsonResponse({ error: 'Verification token is required.' }, 400);
    }

    const tokenHash = await hashToken(body.token);
    const verification = await env.DB.prepare(`
        SELECT account_id FROM account_email_verifications
        WHERE token_hash = ? AND expires_at > ?
    `).bind(tokenHash, new Date().toISOString()).first();
    if (!verification) return jsonResponse({ error: 'This verification link is invalid or expired.' }, 400);

    await env.DB.prepare('UPDATE accounts SET email_verified_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), verification.account_id).run();
    await env.DB.prepare('DELETE FROM account_email_verifications WHERE token_hash = ?')
        .bind(tokenHash).run();
    return jsonResponse({ verified: true });
}
