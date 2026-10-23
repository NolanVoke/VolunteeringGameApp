# Activity approval setup

Activity submissions are stored in Cloudflare D1 and emailed to `nolan@vokey.org` through Resend. An activity stays pending until the reviewer follows the email link and explicitly approves it. Only then does the submitting browser add it to saved activities and XP.

## Configure Cloudflare

1. Create a Cloudflare Pages project for this repository and a D1 database named `volunteering-activities`.
2. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.toml` with the database ID.
3. Apply the schema to the D1 database:

   ```sh
   npx wrangler d1 execute volunteering-activities --remote --file=./schema.sql
   ```

4. Create a Resend account, verify a sender domain, and create an API key. In the Cloudflare Pages project settings, configure:
   - `RESEND_API_KEY` as a secret.
   - `EMAIL_FROM` as a variable using the verified sender, for example `Local Volunteering <volunteer@example.org>`.
   - `SITE_URL` as the HTTPS URL of the deployed Pages site, for example `https://your-project.pages.dev`.
   - Bind the D1 database to the Pages project with the binding name `DB`.
5. Deploy the Pages project. The static app and API functions must be served from the same origin for submissions, status checks, and approval links to work.
6. Before making the site public, add a Cloudflare rate-limiting rule for `POST /api/activities` to reduce automated email abuse.

Until D1 and the email settings are configured, submissions return an error and are not saved locally or awarded XP. Review links are single-use; opening the link alone does not approve the submission.

Profiles and approved activity records remain in the submitting browser’s local storage, as before. Activities recorded before this approval workflow was added remain in local storage and continue to count. The D1 record is the source of truth for new review decisions, but this demo does not provide user accounts or cross-device profile sync.
