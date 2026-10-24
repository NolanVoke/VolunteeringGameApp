<<<<<<< HEAD
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }
});

export async function onRequestGet({ env }) {
    if (!env.DB) return jsonResponse({ error: 'Leaderboard is not configured yet.' }, 503);

    try {
        const [summary, results] = await Promise.all([
            env.DB.prepare(`
                SELECT COUNT(DISTINCT lower(trim(profile_email))) AS volunteers,
                       COALESCE(SUM(hours), 0) AS total_hours,
                       COUNT(*) AS total_activities
                FROM activity_submissions
                WHERE status = 'approved'
            `).first(),
            env.DB.prepare(`
                SELECT MAX(profile_name) AS name,
                       ROUND(SUM(hours), 1) AS hours,
                       COUNT(*) AS activities
                FROM activity_submissions
                WHERE status = 'approved'
                GROUP BY lower(trim(profile_email))
                ORDER BY SUM(hours) DESC, MAX(profile_name) COLLATE NOCASE ASC
                LIMIT 100
            `).all()
        ]);

        return jsonResponse({
            summary: {
                volunteers: Number(summary?.volunteers || 0),
                totalHours: Number(summary?.total_hours || 0),
                totalActivities: Number(summary?.total_activities || 0)
            },
            volunteers: (results.results || []).map((volunteer) => ({
                name: volunteer.name,
                hours: Number(volunteer.hours || 0),
                activities: Number(volunteer.activities || 0)
            }))
        });
    } catch (error) {
        console.error('Could not load leaderboard:', error);
        return jsonResponse({ error: 'Could not load the leaderboard right now.' }, 500);
    }
}
=======
import { getAccountForRequest, jsonResponse } from './auth-helpers.js';

export async function onRequestGet({ request, env }) {
    if (!env.DB) return jsonResponse({ error: 'The community leaderboard is not configured yet.' }, 503);
    const [account, result, summary] = await Promise.all([
        getAccountForRequest(request, env),
        env.DB.prepare(`
            WITH scores AS (
                SELECT account_id, SUM(hours) AS total_hours, COUNT(*) AS activity_count
                FROM activity_submissions
                WHERE status = 'approved' AND account_id IS NOT NULL
                GROUP BY account_id
            ),
            ranked AS (
                SELECT account_id, total_hours, activity_count,
                    RANK() OVER (ORDER BY total_hours DESC) AS rank
                FROM scores
            )
            SELECT ranked.account_id, accounts.name, ranked.total_hours,
                ranked.activity_count, ranked.rank
            FROM ranked
            JOIN accounts ON accounts.id = ranked.account_id
            ORDER BY ranked.rank, accounts.name
            LIMIT 100
        `).all(),
        env.DB.prepare(`
            SELECT COALESCE(SUM(hours), 0) AS total_hours, COUNT(DISTINCT account_id) AS volunteers
            FROM activity_submissions
            WHERE status = 'approved' AND account_id IS NOT NULL
        `).first()
    ]);

    return jsonResponse({
        entries: result.results,
        summary: {
            totalHours: summary.total_hours,
            volunteers: summary.volunteers
        },
        currentAccountId: account?.id || null
    });
}

>>>>>>> 9ccda30 (added accounts)
