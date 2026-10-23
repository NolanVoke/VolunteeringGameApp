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
    let submission;
    try {
        submission = await request.json();
    } catch {
        return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
        return jsonResponse({ error: 'Request body must be an object.' }, 400);
    }

    const id = typeof submission.id === 'string' ? submission.id : '';
    const token = typeof submission.token === 'string' ? submission.token : '';
    if (!id || !token) return jsonResponse({ error: 'Submission id and token are required.' }, 400);

    const tokenHash = await hashToken(token);
    const row = await env.DB.prepare(`
        SELECT id, title, organization, hours, activity_date, notes, status, submission_token_hash
        FROM activity_submissions WHERE id = ?
    `).bind(id).first();
    if (!row || row.submission_token_hash !== tokenHash) {
        return jsonResponse({ error: 'Submission not found.' }, 404);
    }

    const response = { status: row.status };
    if (row.status === 'approved') {
        response.activity = {
            id: row.id,
            title: row.title,
            organization: row.organization,
            hours: row.hours,
            date: row.activity_date,
            notes: row.notes
        };
    }
    return jsonResponse(response);
}
