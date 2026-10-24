# Activity approval setup

Activity submissions are stored in Cloudflare D1 and emailed to `nolan@vokey.org` through Mailjet. An activity stays pending until the reviewer follows the email link and explicitly approves it. Only then does the submitting browser add it to saved activities and XP.

## Configure Cloudflare

This repo is configured to run as a **Worker with static assets**, using the Worker you already created. It does not require creating another application or a Pages project. The `workers.dev` address is the correct site address after the Worker has been updated from its Hello World starter to this repository's code.

1. Keep the existing Worker named `volunteeringgameapp`. Deploy this repository's updated `wrangler.toml` and `worker.js` to that Worker; the config serves the site files and routes `/api/*` requests to the application handlers.
2. Create a D1 database named `volunteering-activities` if it does not already exist. Confirm that `database_id` in `wrangler.toml` matches its ID.
3. Apply the schema from the Cloudflare dashboard: open [D1 SQL databases](https://dash.cloudflare.com/?to=/:account/workers/d1), select `volunteering-activities`, open **Console**, paste the contents of `schema.sql`, and select **Execute**.
4. In Mailjet, add a sender email address you can access under **Account settings → Senders & Domains → Sender addresses**, then confirm the verification email. This sender-address verification does not require DNS changes. Open **Account settings → API keys** and copy the API key and secret key. Treat both as passwords; do not put them in the repository or paste them into chat.
5. In Cloudflare, open **Workers & Pages → volunteeringgameapp → Settings → Variables and Secrets** (the Worker settings, not the D1 database):
   - Add `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` as **secrets**, using the values from Mailjet.
   - Add `MAILJET_FROM_EMAIL` as a **variable** containing only the verified sender address, e.g. `you@gmail.com`.
   - `SITE_URL` is already set in `wrangler.toml` to `https://volunteeringgameapp.nolan-0ee.workers.dev`. If Cloudflare shows a different hostname for this Worker, change `SITE_URL` in `wrangler.toml` to that exact HTTPS origin and deploy again.
   - The D1 binding `DB` is declared in `wrangler.toml`; after deployment, confirm this Worker has that binding connected to `volunteering-activities`.
6. Deploy the updated repository to the existing Worker. If Cloudflare has connected this Worker to the GitHub repository, commit and push the changes to its production branch; wait for the new deployment to finish. Then open `https://volunteeringgameapp.nolan-0ee.workers.dev/`; it should show the volunteering site, not “Hello World.” The app and API now share that origin.
7. Before making the site public, add a Cloudflare rate-limiting rule for `POST /api/activities` to reduce automated email abuse.

Until D1 and the email settings are configured, submissions return an error and are not saved locally or awarded XP. Review links are single-use; opening the link alone does not approve the submission.

<<<<<<< HEAD
Mailjet's free plan currently has a daily sending limit, so it should be suitable for low-volume approval notifications but may not be suitable if the app sends many emails in a short period.

Profiles and approved activity records remain in the submitting browser’s local storage, as before. Activities recorded before this approval workflow was added remain in local storage and continue to count. The D1 record is the source of truth for new review decisions, but this demo does not provide user accounts or cross-device profile sync.
=======
Profiles and approved activity records remain in the submitting browser’s local storage, as before. Activities recorded before this approval workflow was added remain in local storage and continue to count on that browser. The Community leaderboard reads approved records from D1 and does not include older browser-only activity. The D1 record is the source of truth for new review decisions, but this demo does not provide user accounts, passwords, or cross-device profile sync. No password is collected or stored; review tokens are stored only as SHA-256 hashes.
>>>>>>> refs/remotes/origin/Santi
