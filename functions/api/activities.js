const approverEmail = 'nolan@vokey.org';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }
});

const token = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
};

const hashToken = async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export async function onRequestPost({ request, env }) {
    if (!env.DB || !env.RESEND_API_KEY || !env.EMAIL_FROM || !env.SITE_URL) {
        return jsonResponse({ error: 'Activity review is not configured yet.' }, 503);
    }
    let siteUrl;
    try {
        siteUrl = new URL(env.SITE_URL);
    } catch {
        return jsonResponse({ error: 'Activity review is not configured yet.' }, 503);
    }
    if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password) {
        return jsonResponse({ error: 'Activity review is not configured yet.' }, 503);
    }

    let submission;
    try {
        submission = await request.json();
    } catch {
        return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
    }
    if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
        return jsonResponse({ error: 'Request body must be an activity object.' }, 400);
    }

    const activity = {
        name: typeof submission.name === 'string' ? submission.name.trim() : '',
        email: typeof submission.email === 'string' ? submission.email.trim() : '',
        title: typeof submission.title === 'string' ? submission.title.trim() : '',
        organization: typeof submission.organization === 'string' ? submission.organization.trim() : '',
        hours: Number(submission.hours),
        date: typeof submission.date === 'string' ? submission.date : '',
        notes: typeof submission.notes === 'string' ? submission.notes.trim() : ''
    };
    const parsedDate = new Date(`${activity.date}T00:00:00Z`);
    const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(activity.date)
        && !Number.isNaN(parsedDate.getTime())
        && parsedDate.toISOString().slice(0, 10) === activity.date;

    if (!activity.name || activity.name.length > 80
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(activity.email) || activity.email.length > 254
        || !activity.title || activity.title.length > 100
        || activity.organization.length > 100
        || !Number.isFinite(activity.hours) || activity.hours < 0.1 || activity.hours > 24
        || !dateIsValid || activity.notes.length > 400) {
        return jsonResponse({ error: 'Some activity details are missing or invalid.' }, 400);
    }

    const id = crypto.randomUUID();
    const approvalToken = token();
    const submissionToken = token();
    const approvalTokenHash = await hashToken(approvalToken);
    const submissionTokenHash = await hashToken(submissionToken);

    await env.DB.prepare(`
        INSERT INTO activity_submissions
            (id, profile_name, profile_email, title, organization, hours, activity_date, notes,
             status, approval_token_hash, submission_token_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
        id,
        activity.name,
        activity.email,
        activity.title,
        activity.organization,
        activity.hours,
        activity.date,
        activity.notes,
        approvalTokenHash,
        submissionTokenHash,
        new Date().toISOString()
    ).run();

    const approvalUrl = new URL(`/approval.html?token=${encodeURIComponent(approvalToken)}`, siteUrl).href;
    const emailText = [
        'A volunteer activity is waiting for your review.',
        '',
        `Volunteer: ${activity.name}`,
        `Email: ${activity.email}`,
        `Activity: ${activity.title}`,
        `Organization or location: ${activity.organization || 'Not provided'}`,
        `Date: ${activity.date}`,
        `Time: ${activity.hours} hours`,
        `Notes: ${activity.notes || 'None'}`,
        '',
        'Review and approve or reject this activity:',
        approvalUrl
    ].join('\n');

    let emailResponse;
    try {
        emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: ['Bearer', env.RESEND_API_KEY].join(' '),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: env.EMAIL_FROM,
                to: [approverEmail],
                subject: 'Volunteer activity waiting for approval',
                text: emailText
            })
        });
    } catch (error) {
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error('Could not contact the email provider:', error);
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    if (!emailResponse.ok) {
        const providerError = await emailResponse.text();
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error(`Email provider rejected the review message (${emailResponse.status}):`, providerError);
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    return jsonResponse({ id, token: submissionToken, status: 'pending' }, 201);
}
