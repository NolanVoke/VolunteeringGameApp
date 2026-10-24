import { getAccountForRequest, jsonResponse } from './auth-helpers.js';

export async function onRequestGet({ request, env }) {
    if (!env.DB) return jsonResponse({ error: 'Accounts are not configured yet.' }, 503);
    const account = await getAccountForRequest(request, env);
    if (!account) return jsonResponse({ error: 'Sign in to view your account.' }, 401);

    const [activityRows, submissionRows] = await Promise.all([
        env.DB.prepare(`
            SELECT id, title, organization, hours, activity_date, notes
            FROM activity_submissions
            WHERE account_id = ? AND status = 'approved'
            ORDER BY activity_date DESC, created_at DESC
        `).bind(account.id).all(),
        env.DB.prepare(`
            SELECT id, title, organization, hours, activity_date, status
            FROM activity_submissions
            WHERE account_id = ? AND status != 'approved'
            ORDER BY created_at DESC
        `).bind(account.id).all()
    ]);

    return jsonResponse({
        account,
        activities: activityRows.results.map((row) => ({
            id: row.id,
            title: row.title,
            organization: row.organization,
            hours: row.hours,
            date: row.activity_date,
            notes: row.notes
        })),
        submissions: submissionRows.results.map((row) => ({
            id: row.id,
            title: row.title,
            organization: row.organization,
            hours: row.hours,
            date: row.activity_date,
            status: row.status
        }))
    });
}
