import { onRequestPost as submitActivity } from './functions/api/activities.js';
import { onRequestPost as submitReviewDecision } from './functions/api/approval.js';
import { onRequestPost as checkActivityStatus } from './functions/api/activities/status.js';

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
            '/api/activities': submitActivity,
            '/api/approval': submitReviewDecision,
            '/api/activities/status': checkActivityStatus
        };
        const handler = routes[pathname];

        if (handler) {
            if (request.method !== 'POST') {
                return jsonResponse({ error: 'Method not allowed.' }, 405);
            }
            return handler({ request, env, waitUntil: context.waitUntil.bind(context) });
        }

        if (pathname.startsWith('/api/')) {
            return jsonResponse({ error: 'Not found.' }, 404);
        }

        return env.ASSETS.fetch(request);
    }
};
