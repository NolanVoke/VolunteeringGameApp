import { onRequestPost as submitActivity } from './functions/api/activities.js';
import { onRequestGet as getReviewSubmission, onRequestPost as submitReviewDecision } from './functions/api/approval.js';
import { onRequestPost as checkActivityStatus } from './functions/api/activities/status.js';
import { onRequestPost as authPost } from './functions/api/auth.js';
import { onRequestGet as getAccount } from './functions/api/account.js';
import { onRequestGet as getLeaderboard } from './functions/api/leaderboard.js';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }
});

export default {
    async fetch(request, env, context) {
        const { pathname } = new URL(request.url);
        const routes = {
            'POST /api/activities': submitActivity,
            'POST /api/approval': submitReviewDecision,
            'GET /api/approval': getReviewSubmission,
            'POST /api/activities/status': checkActivityStatus,
            'POST /api/auth/register': authPost,
            'POST /api/auth/login': authPost,
            'POST /api/auth/logout': authPost,
            'POST /api/auth/verify': authPost,
            'GET /api/account': getAccount,
            'GET /api/leaderboard': getLeaderboard
        };
        const handler = routes[`${request.method} ${pathname}`];

        if (handler) {
            return handler({ request, env, waitUntil: context.waitUntil.bind(context) });
        }

        if (pathname.startsWith('/api/')) {
            if (Object.keys(routes).some((route) => route.endsWith(pathname))) {
                return jsonResponse({ error: 'Method not allowed.' }, 405);
            }
            return jsonResponse({ error: 'Not found.' }, 404);
        }

        return env.ASSETS.fetch(request);
    }
};
