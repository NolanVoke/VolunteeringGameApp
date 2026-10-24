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

export async function onRequestGet({ request, env }) {
    if (!env.DB) return jsonResponse({ error: 'Activity review is not configured yet.' }, 503);
    const token = new URL(request.url).searchParams.get('token') || '';
    if (!token) return jsonResponse({ error: 'Review token is required.' }, 400);

    const row = await env.DB.prepare(`
        SELECT profile_name, profile_email, title, organization, hours, duration_minutes,
            activity_date, notes, before_photo, after_photo, status
        FROM activity_submissions
        WHERE approval_token_hash = ?
    `).bind(await hashToken(token)).first();
    if (!row) return jsonResponse({ error: 'Review link is invalid.' }, 404);

    return jsonResponse({
        activity: {
            name: row.profile_name,
            email: row.profile_email,
            title: row.title,
            organization: row.organization,
            hours: row.hours,
            durationMinutes: row.duration_minutes ?? Math.round(Number(row.hours) * 60),
            date: row.activity_date,
            notes: row.notes,
            beforePhoto: row.before_photo,
            afterPhoto: row.after_photo,
            status: row.status
        }
    });
}

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

    try {
        const tokenHash = await hashToken(decision.token);
        const update = decision.status === 'approved'
            ? await env.DB.prepare(`
                UPDATE activity_submissions
                SET status = 'approved', reviewed_at = ?
                WHERE approval_token_hash = ? AND status = 'pending'
                    AND before_photo IS NOT NULL AND after_photo IS NOT NULL
            `).bind(new Date().toISOString(), tokenHash).run()
            : await env.DB.prepare(`
                UPDATE activity_submissions
                SET status = 'rejected', reviewed_at = ?
                WHERE approval_token_hash = ? AND status = 'pending'
            `).bind(new Date().toISOString(), tokenHash).run();

        if (update.meta.changes === 1) return jsonResponse({ status: decision.status });

        const existing = await env.DB.prepare(`
            SELECT status, before_photo, after_photo
            FROM activity_submissions WHERE approval_token_hash = ?
        `).bind(tokenHash).first();
        if (!existing) return jsonResponse({ error: 'Review link is invalid.' }, 404);
        if (existing.status === 'pending' && decision.status === 'approved'
            && (!existing.before_photo || !existing.after_photo)) {
            return jsonResponse({ error: 'This submission cannot be approved because it has no before-and-after photos.' }, 409);
        }
        return jsonResponse({ error: `This activity was already ${existing.status}.` }, 409);
    } catch (error) {
        console.error('Could not save activity review decision:', error);
        return jsonResponse({ error: 'Could not save this review decision. Please try again or check the Worker logs.' }, 500);
    }
}
