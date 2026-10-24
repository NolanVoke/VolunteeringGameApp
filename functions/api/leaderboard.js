import { getAccountForRequest, jsonResponse } from './auth-helpers.js';

export async function onRequestGet({ request, env }) {
    if (!env.DB) return jsonResponse({ error: 'The community leaderboard is not configured yet.' }, 503);

    try {
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
                totalHours: Number(summary?.total_hours || 0),
                volunteers: Number(summary?.volunteers || 0)
            },
            currentAccountId: account?.id || null
        });
    } catch (error) {
        console.error('Could not load leaderboard:', error);
        return jsonResponse({ error: 'Could not load the leaderboard right now.' }, 500);
    }
}
