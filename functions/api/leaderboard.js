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