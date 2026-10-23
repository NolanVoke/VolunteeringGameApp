const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }
});

const hashToken = async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export async function onRequestPost({ request, env }) {
    let decision;
    try {
        decision = await request.json();
    } catch {
        return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }

    if (!decision || typeof decision !== 'object' || Array.isArray(decision)
        || typeof decision.token !== 'string' || !decision.token
        || !['approved', 'rejected'].includes(decision.status)) {
        return jsonResponse({ error: 'A valid review decision is required.' }, 400);
    }

    const tokenHash = await hashToken(decision.token);
    const update = await env.DB.prepare(`
        UPDATE activity_submissions
        SET status = ?, reviewed_at = ?
        WHERE approval_token_hash = ? AND status = 'pending'
    `).bind(decision.status, new Date().toISOString(), tokenHash).run();

    if (update.meta.changes === 1) return jsonResponse({ status: decision.status });

    const existing = await env.DB.prepare(`
        SELECT status FROM activity_submissions WHERE approval_token_hash = ?
    `).bind(tokenHash).first();
    if (!existing) return jsonResponse({ error: 'Review link is invalid.' }, 404);
    return jsonResponse({ error: `This activity was already ${existing.status}.` }, 409);
}
