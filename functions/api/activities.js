import { getAccountForRequest } from './auth-helpers.js';

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
    if (!env.DB || !env.MAILJET_API_KEY || !env.MAILJET_SECRET_KEY
        || !env.MAILJET_FROM_EMAIL || !env.SITE_URL) {
        return jsonResponse({ error: 'Activity review is not configured yet.' }, 503);
    }
    const account = await getAccountForRequest(request, env);
    if (!account) return jsonResponse({ error: 'Sign in before submitting volunteer activity.' }, 401);
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

    const durationMinutes = Number(submission.durationMinutes);
    const beforePhoto = typeof submission.beforePhoto === 'string' ? submission.beforePhoto : '';
    const afterPhoto = typeof submission.afterPhoto === 'string' ? submission.afterPhoto : '';
    const activity = {
        name: account.name,
        email: account.email,
        title: typeof submission.title === 'string' ? submission.title.trim() : '',
        organization: typeof submission.organization === 'string' ? submission.organization.trim() : '',
        durationMinutes,
        hours: durationMinutes / 60,
        date: typeof submission.date === 'string' ? submission.date : '',
        notes: typeof submission.notes === 'string' ? submission.notes.trim() : '',
        beforePhoto,
        afterPhoto
    };
    const isValidPhoto = (photo) => {
        if (photo.length > 500_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) return false;
        try {
            const firstBytes = atob(photo.slice('data:image/jpeg;base64,'.length, 'data:image/jpeg;base64,'.length + 8));
            return firstBytes.charCodeAt(0) === 0xff
                && firstBytes.charCodeAt(1) === 0xd8
                && firstBytes.charCodeAt(2) === 0xff;
        } catch {
            return false;
        }
    };
    const parsedDate = new Date(`${activity.date}T00:00:00Z`);
    const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(activity.date)
        && !Number.isNaN(parsedDate.getTime())
        && parsedDate.toISOString().slice(0, 10) === activity.date;

    if (!activity.title || activity.title.length > 100
        || activity.organization.length > 100
        || !Number.isInteger(activity.durationMinutes) || activity.durationMinutes < 1 || activity.durationMinutes > 1440
        || !dateIsValid || activity.notes.length > 400) {
        return jsonResponse({ error: 'Some activity details are missing or invalid.' }, 400);
    }
    if (!isValidPhoto(beforePhoto) || !isValidPhoto(afterPhoto)) {
        return jsonResponse({ error: 'A valid before photo and after photo are both required. Each photo must be a JPEG under 350 KB.' }, 400);
    }

    const id = crypto.randomUUID();
    const approvalToken = token();
    const submissionToken = token();
    const approvalTokenHash = await hashToken(approvalToken);
    const submissionTokenHash = await hashToken(submissionToken);

    await env.DB.prepare(`
        INSERT INTO activity_submissions
            (id, profile_name, profile_email, title, organization, hours, activity_date, notes,
             status, approval_token_hash, submission_token_hash, created_at, account_id,
             duration_minutes, before_photo, after_photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
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
        new Date().toISOString(),
        account.id,
        activity.durationMinutes,
        beforePhoto,
        afterPhoto
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
        `Time: ${Math.floor(activity.durationMinutes / 60)} hours ${activity.durationMinutes % 60} minutes`,
        'Before and after photos are available on the secure review page linked below.',
        `Notes: ${activity.notes || 'None'}`,
        '',
        'Review and approve or reject this activity:',
        approvalUrl
    ].join('\n');

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
                    From: {
                        Email: env.MAILJET_FROM_EMAIL,
                        Name: 'Local Volunteering'
                    },
                    To: [{ Email: approverEmail }],
                    Subject: 'Volunteer activity waiting for approval',
                    TextPart: emailText
                }]
            })
        });
    } catch (error) {
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error('Could not contact the email provider:', error);
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    let emailResult;
    try {
        emailResult = await emailResponse.json();
    } catch (error) {
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error('Email provider returned an invalid response:', error);
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    if (!emailResponse.ok || emailResult.Messages?.[0]?.Status !== 'success') {
        const providerError = JSON.stringify(emailResult);
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error(`Email provider rejected the review message (${emailResponse.status}):`, providerError);
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    if (!emailResult.Messages?.[0]?.To?.length) {
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error('Email provider did not confirm delivery to the reviewer.');
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    if (!emailResult.Messages[0].To.some((recipient) => recipient.Email === approverEmail)) {
        await env.DB.prepare('DELETE FROM activity_submissions WHERE id = ?').bind(id).run();
        console.error('Email provider response did not include the expected reviewer recipient.');
        return jsonResponse({ error: 'Could not send the activity for review. Please try again.' }, 502);
    }

    return jsonResponse({ id, status: 'pending' }, 201);
}
