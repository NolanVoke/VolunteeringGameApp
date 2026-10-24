# Accounts and activity approval setup

Activity submissions are stored in Cloudflare D1 and emailed to `nolan@vokey.org` through Mailjet. An activity stays pending until the reviewer follows the email link and explicitly approves it. Only approved activities are saved to the volunteer's account and count toward XP and the shared leaderboard.

## Configure Cloudflare

This repo is configured to run as a **Worker with static assets**, using the Worker you already created. It does not require creating another application or a Pages project. The `workers.dev` address is the correct site address after the Worker has been updated from its Hello World starter to this repository's code.

1. Keep the existing Worker named `volunteeringgameapp`. Deploy this repository's updated `wrangler.toml` and `worker.js` to that Worker; the config serves the site files and routes `/api/*` requests to the application handlers.
2. Create a D1 database named `volunteering-activities` if it does not already exist. Confirm that `database_id` in `wrangler.toml` matches its ID.
3. Apply the database schema in the Cloudflare dashboard: open [D1 SQL databases](https://dash.cloudflare.com/?to=/:account/workers/d1), select `volunteering-activities`, and open **Console**. For a new database, run `schema.sql` first. Then run `account-schema.sql` once to create the account tables and link activities to accounts, followed by `activity-evidence-schema.sql` once to add minute-level durations and before/after photos. If the account schema has already been installed, run only `activity-evidence-schema.sql`. Both migration files contain one-time `ALTER TABLE` statements and must not be rerun after they succeed.
4. In Mailjet, add a sender email address you can access under **Account settings → Senders & Domains → Sender addresses**, then confirm the verification email. This sender-address verification does not require DNS changes. Open **Account settings → API keys** and copy the API key and secret key. Treat both as passwords; do not put them in the repository or paste them into chat.
5. In Cloudflare, open **Workers & Pages → volunteeringgameapp → Settings → Variables and Secrets** (the Worker settings, not the D1 database):
   - Add `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` as **secrets**, using the values from Mailjet.
   - Add `MAILJET_FROM_EMAIL` as a **variable** containing only the verified sender address, e.g. `you@gmail.com`.
   - `SITE_URL` is already set in `wrangler.toml` to `https://volunteeringgameapp.nolan-0ee.workers.dev`. If Cloudflare shows a different hostname for this Worker, change `SITE_URL` in `wrangler.toml` to that exact HTTPS origin and deploy again.
   - The D1 binding `DB` is declared in `wrangler.toml`; after deployment, confirm this Worker has that binding connected to `volunteering-activities`.
6. Deploy the updated repository to the existing Worker. If Cloudflare has connected this Worker to the GitHub repository, commit and push the changes to its production branch; wait for the new deployment to finish. Then open `https://volunteeringgameapp.nolan-0ee.workers.dev/`; it should show the volunteering site, not “Hello World.” The app and API now share that origin.
7. Before making the site public, add Cloudflare rate-limiting rules for `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/activities` to reduce automated password-hashing, login, and email abuse.

Account creation emails a 24-hour verification link through Mailjet. Passwords are PBKDF2-hashed in the Worker, and sessions use secure, HTTP-only cookies. Each activity submission requires both a before and an after photo; the browser converts photos to JPEGs under 350 KB before upload, D1 stores them with the activity, and reviewers can inspect them on the secure approval page before deciding. Enter duration in whole hours and minutes. Until D1 and the email settings are configured, account creation and activity submissions return an error. Review links are single-use; opening the link alone does not approve the submission.

Mailjet's free plan currently has a daily sending limit, so it should be suitable for low-volume approval notifications but may not be suitable if the app sends many emails in a short period.

Profiles, approved activity records, XP, and leaderboard totals are loaded from D1 after sign-in. Only approved activities submitted while signed in are linked to an account and included in the shared leaderboard. Older browser-only activities and old approval records are not automatically claimed or imported into an account.
