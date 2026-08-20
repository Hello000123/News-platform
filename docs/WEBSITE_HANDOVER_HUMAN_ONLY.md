# PressReady Website Human Handover Manual (Human-Only Version)

**Purpose:** Employee departure, transfer of responsibilities, and successor onboarding  
**Language:** English  
**Prepared:** 20 August 2026  
**Production snapshot date:** 19 August 2026, Hong Kong time  
**Production website:** <https://pressready-review.931smd-cloudflare-account.workers.dev>  
**Cloudflare Worker:** `pressready-review`  
**Primary local source folder:** `News-platform/`  
**GitHub repository:** <https://github.com/Hello000123/News-platform>

This manual is written only for company personnel to read, execute, review, and sign. Its intended readers are the departing employee, the technical successor, management, editorial staff, security and privacy owners, and incident responders. It covers responsibilities, practical operations, decisions, verification, and sign-off performed by people.

PressReady itself contains AI-assisted review and rewriting features. This manual therefore retains the human operating procedures, vendor details, cost controls, and security risks for those product features. They are part of website operations, and every final decision remains the responsibility of an authorized person.

This manual contains no passwords, API keys, sessions, one-time setup links, private documents, database contents, or other secret values. Secret material must be transferred only through a company-approved password manager or the appropriate service administration console.

---

## 1. Definition of a Complete Handover

The handover is complete only when all of the following conditions have been met:

- The company has formally named owners for product, editorial, engineering, Cloudflare, GitHub, data, security, privacy, and finance.
- The successor has signed in to every required service using their own company account, rather than continuing to use the departing employee's session.
- The successor has personally demonstrated account administration, news ingestion, article review, publication, correction, and unpublishing.
- The technical successor has preserved all three local source checkouts and confirmed that GitHub is no longer the only—and incomplete—copy.
- The Worker, D1 migrations, R2 bucket, secret names, and provider configuration currently used in production have been rechecked and dated.
- A D1 export has been placed in company-approved encrypted storage and confirmed readable.
- An owner has been assigned for R2 backup, retention, and recovery.
- The company has decided how to handle `PASSWORD_PEPPER` before any rotation of `AUTH_SECRET`.
- The successor can sign in, inspect billing, retrieve backups, and start incident escalation without help from the departing employee.
- Every incomplete item has a documented company decision and risk record.
- The departing employee, successor, and management have signed the final checklist.

Merely delivering a document, sending a password to another person, or confirming that the website still opens does not constitute a completed handover.

## 2. The Three Most Important Risks

### 2.1 GitHub Does Not Contain All Source Work

In the state verified on 19 August 2026, the primary local `main` branch was 14 commits ahead of `origin/main`. It also contained 17 modified but uncommitted tracked files, plus untracked tests and handover documents. Downloading only the GitHub default branch therefore cannot reproduce the complete state of work at departure.

Two additional local checkouts must not be deleted immediately:

- `News-platform-latest/`
- `AI-Agent-News-Review-Rewrite/`

These folders may have different branches, remotes, commits, or unpreserved changes. The words “AI-Agent” in a folder name do not mean it is a handover tool; it is simply the name of one local source checkout.

### 2.2 `AUTH_SECRET` May Also Be the Password Pepper

The production snapshot included `AUTH_SECRET` but did not list a separate `PASSWORD_PEPPER`. When no valid `PASSWORD_PEPPER` is configured, the current code falls back to using `AUTH_SECRET` as the password pepper.

Rotating `AUTH_SECRET` without a migration plan or a coordinated password reset for all users could therefore make every existing password proof fail. An employee departure is not sufficient reason to rotate this secret blindly. The engineering and security owners must first approve a plan, test recovery, and then perform the change.

### 2.3 Releases, Monitoring, and Backups Still Depend on Manual Work

The repository does not contain a complete protected CI/CD process, automated D1/R2 backups, deployment metadata linked to Git commits, a durable observability pipeline, or a verified company production domain. Production releases and recovery still depend heavily on people following commands correctly and recording evidence.

The successor should improve these areas during the first month before adding substantial new functionality without equivalent safeguards.

## 3. Immediate Stop and Preservation Rules

Until source preservation is complete, nobody may:

- Delete any of the three local source folders.
- Run `git reset --hard`, `git clean`, or any other command that could discard local work.
- Force-push `main` or overwrite remote history.
- Assume that the GitHub default branch is the production source.
- Deploy from an unidentified, unreviewed, or dirty working tree.
- Wipe the departing employee's computer before locating and preserving source code.
- Commit `.env`, `.dev.vars`, database exports, or provider keys to Git.

Any preservation action should be checked by two people: one person performs the action and another confirms the target folder, branch, remote, and files that will be uploaded.

## 4. Human Actions During the First 24 Hours

1. Management appoints a handover coordinator and technical successor.
2. Pause cleanup of the departing employee's computer and revocation of relevant service access.
3. Store this manual in an approved company document location with appropriate internal access controls.
4. Complete the ownership register and incident contact table below.
5. The technical successor inventories all three local checkouts, recording branch, commit, remote, ahead/behind state, and dirty files for each one.
6. Review changes for secrets before creating a preservation branch, pushing it, and opening a pull request.
7. Identify the reviewed commit closest to the live Worker and explicitly document every unverified difference.
8. The successor signs in to GitHub, Cloudflare, Resend, xAI, DeepSeek, billing, and the password manager using their own company identity.
9. A second company administrator confirms that they can also access and recover the accounts.
10. Export D1 to approved encrypted storage and record its checksum, date, operator, and retention period.
11. Assign responsibility for R2 backup and restore testing.
12. Using the successor's account, complete public-page, authentication, employee-area, pipeline, and logout smoke checks.
13. Confirm that billing and security alerts are no longer sent only to the departing employee's personal address.
14. Revoke the departing employee's personal access only after the preceding acceptance checks have passed.

## 5. People and Ownership Register

Do not enter passwords or keys in this table. The evidence field should link to an internal ticket, access screenshot, service invitation, or approval record.

| Area | Accountable owner | Day-to-day operator | Backup | Access tested | Evidence/internal record |
| --- | --- | --- | --- | --- | --- |
| Product scope and release decisions | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Editorial standards, publication, and corrections | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Application maintenance | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| GitHub organization/repository | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Cloudflare account and billing | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| D1 database and recovery | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| R2 files, backup, and retention | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Resend account, sender, domain, and billing | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| xAI account, quota, and billing | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| DeepSeek account, quota, and billing | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Password manager and company recovery | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Security incidents | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Privacy and data requests | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |
| Out-of-hours escalation | **To be completed** | **To be completed** | **To be completed** | [ ] | **To be completed** |

## 6. Human Acceptance Test for Access Transfer

Complete these steps separately for every external service. An invitation being sent is not proof that access works.

1. The successor signs out of any session left by the departing employee.
2. On their own device, the successor signs in using their own company identity.
3. Confirm the correct organization, account, team, project, and billing profile.
4. Confirm that the role is sufficient for the person's work but does not grant unnecessary top-level access.
5. Perform a safe read-only action to prove that access extends beyond the login screen.
6. Where administrative access is required, verify it on a settings page without changing production.
7. A second company administrator confirms that their access and recovery route also work.
8. Route security, billing, quota, and outage notifications to a monitored company address.
9. Record the date, person, role, and evidence for the test.
10. Remove the departing employee's personal email, device, and tokens only after company recovery has been tested.

The Wrangler identity observed on 19 August 2026 was `info@931smd.com`. This is a dated observation, not permanent proof of ownership, and must be rechecked by the successor.

## 7. Company Incident Contact Table

| Severity | Example | Initial response target | Decision maker | Technical responder | Editorial/comms responder | Channel |
| --- | --- | --- | --- | --- | --- | --- |
| Critical | Total outage, compromise, major data disclosure | **To be completed** | **To be completed** | **To be completed** | **To be completed** | **To be completed** |
| High | All logins fail, widespread incorrect publication, uncontrolled spend | **To be completed** | **To be completed** | **To be completed** | **To be completed** | **To be completed** |
| Medium | Single provider outage, feed backlog, email failure | **To be completed** | **To be completed** | **To be completed** | **To be completed** | **To be completed** |
| Low | Visual defect, one paused feed, documentation update | **To be completed** | **To be completed** | **To be completed** | **To be completed** | **To be completed** |

Every incident record should include the start time, reporter, affected pages/users, last known healthy time, recent changes, actions taken, approvals, current status, and next update time.

## 8. What PressReady Is

PressReady is a news platform built with Next.js 16, React 19, and TypeScript, packaged through OpenNext, and deployed to Cloudflare Workers. It has four main parts:

1. A public news website.
2. An authenticated article review and rewriting workspace.
3. An authenticated news-ingestion, editing, and publishing pipeline.
4. An employee-only area for account, feed, usage, and presentation administration.

The principal external services are:

| Service | Purpose | Handover focus |
| --- | --- | --- |
| GitHub | Source code and pull requests | The remote is currently incomplete; preserve local work first |
| Cloudflare Workers | Website runtime | Confirm Worker, deployment, access, and billing |
| Cloudflare D1 | Accounts, articles, feeds, sessions, settings, and audit data | Backup, migrations, and restore access |
| Cloudflare R2 | Private application attachments and managed images | Keep private; establish backup and retention |
| Resend | Account and suspension-related email | Snapshot uses a test sender; verify a company domain |
| xAI | Grok models | Model permission, quota, billing, and key management |
| DeepSeek | DeepSeek models | Model permission, quota, billing, and key management |

## 9. User Types and Permissions

### Public Visitors

Public visitors can read published articles, open the login page, and request an account. They cannot view private drafts, the pipeline, employee administration data, or attachments.

### Clients

Approved clients who have completed password setup can sign in and use article review/rewriting, file text extraction, and pipeline functions. Clients can currently publish or unpublish pipeline articles. If company policy should prevent this, treat it as a product and authorization change; do not rely on a verbal rule.

### Employees

Employees have client capabilities and can additionally manage account applications, clients, AI-usage thresholds, feeds, employee accounts, public presentations, and client summaries.

Actual authorization must be enforced by server routes. A hidden browser button is not an authorization boundary.

## 10. Main Pages

| Page | Purpose |
| --- | --- |
| `/` | Public home page |
| `/technology` | Technology category |
| `/social-enterprise` | Social-enterprise category |
| `/news` | News index |
| `/news/[id]` | Public article |
| `/request-account` | Account application |
| `/request-submitted` | Application confirmation |
| `/login` | Login |
| `/setup-password` | Password setup for an approved account |
| `/review` | Article review and rewriting |
| `/pipeline` | Content ingestion, editing, and publishing |
| `/employee` | Employee administration home |
| `/employee/requests/[id]` | Individual account application |
| `/employee/clients/[id]` | Individual client record and summary |

## 11. Account Application and Approval

### Applicant Steps

1. Open `/request-account`.
2. Enter the company and contact information.
3. Upload supporting documents if required.
4. Submit the form and view `/request-submitted`.

### Employee Steps

1. Open **Account Approval** under `/employee`.
2. Open the application and verify its information and attachments.
3. Approve or reject it according to company policy.
4. Approval creates or updates the account and sends a password-setup link.
5. If the applicant does not receive it, verify the email address and status before using the resend function.
6. Never copy a setup link into a public ticket, ordinary group chat, or unencrypted email.
7. Record the approver, date, and any exceptional decision.

Account emails depend on Resend. The recorded sender in the snapshot is `onboarding@resend.dev`, which is intended for testing; delivery to ordinary recipients may be restricted. The company should verify its own domain and update the sender.

## 12. Client Suspension, Recovery, and Removal

### Suspension

Use suspension for temporary, investigatory, or reversible situations. Suspension preserves the account and related data. Record the reason, approver, start time, and expected review time.

### Recovery

Before restoring access, confirm that the original reason has been resolved, the identity is correct, and whether a password reset or old-session revocation is required. The account holder should sign in again after recovery.

### Removal

Removal is permanent and deletes the client and related server data. Perform it only when all of the following are true:

- The business has provided written approval.
- The privacy/data function has confirmed retention requirements.
- Engineering has listed the affected data.
- The company has decided whether lawful retention, export, or audit evidence is required.
- A second person has confirmed the correct account.

Do not remove an account merely because access should be blocked temporarily; suspend it instead.

## 13. Routine News-Feed Operations

Employees can create, edit, pause, resume, remove, and manually fetch feeds under **News Feeds**.

The Cloudflare cron fires each day at `00:00 UTC`, or `08:00` Hong Kong time. A D1 schedule setting then decides whether ingestion is due. The 19 August 2026 snapshot showed the schedule enabled at a 1,440-minute interval.

Check each day:

- Whether `last_auto_fetch_at` has advanced as expected.
- The last success and failure time for each feed.
- Whether a failure affects one source or all sources.
- Whether the pipeline contains a reasonable number of new articles.
- Whether a publisher changed its page, added an anti-bot challenge, or returned incomplete content.

When a problem occurs:

1. Review the schedule and recent error first.
2. Perform only one controlled manual fetch to avoid repeated high-volume requests.
3. Determine whether the cause is the publisher, network, parser, Cloudflare, or database.
4. Pause a persistently blocked source rather than immediately removing it.
5. Do not bypass publisher protections or access restrictions.
6. After fixing a parser, update the known behavior in `directives/scrape_news.md`.

Removing a feed may also delete related pipeline data. Use pause—not remove—for a temporary problem.

## 14. Editorial Pipeline and Human Publication Flow

Article states include `new`, `rewritten`, `approved`, and `discarded`. Feed or JSON ingestion does not automatically publish content.

Recommended human workflow:

1. Select the article in `/pipeline`.
2. Confirm the source URL, title, author, timestamp, and full source text.
3. Treat an RSS summary only as a preview; do not assume that it is the complete article.
4. If using PressReady's built-in rewriting feature, a person selects the model, language, length, and instruction.
5. Review rewrite diagnostics and investigate errors or insufficient-evidence warnings.
6. Manually edit the headline, body, category, image, and credit.
7. Use **Save changes** to preserve the version awaiting review.
8. An authorized person completes factual, legal, privacy, and editorial checks.
9. Use **Publish to homepage** only after approval.
10. After publication, open the public article on desktop and mobile and check its headline, body, image, and category.
11. Record the publisher, approver, time, and required source evidence.

Other interface labels may include **Rewrite draft**, **Rewrite again**, **Rewrite & publish**, **Update homepage**, **View live post**, **Unpublish**, and **Discard**. If company policy requires two-person approval, avoid **Rewrite & publish**, which can publish directly.

### Pre-Publication Checklist

- [ ] The full source is available, not only a feed summary.
- [ ] Names, organizations, titles, dates, and places are correct.
- [ ] Numbers, currencies, percentages, units, model numbers, and rankings are correct.
- [ ] Quotations and speakers are correct; no quotation was invented.
- [ ] The article contains no statement unsupported by the source evidence.
- [ ] Language conversion has not changed the meaning.
- [ ] The category is correct.
- [ ] Image rights and credit are correct, and the image contains no private data.
- [ ] Any required second-person approval is complete.
- [ ] The post-publication checker and check time have been recorded.

## 15. Corrections, Unpublishing, and Harmful Content

If a published article contains a material error, infringement, privacy problem, or potentially harmful content:

1. Preserve the public URL, screenshots, discovery time, and complaint details.
2. Notify the editorial and decision owners.
3. If the risk remains active, obtain approval and **Unpublish** first.
4. Review the source, AI-assisted rewrite, human edits, and presentation changes.
5. Correct the article only from reliable evidence.
6. Have another authorized person review it.
7. After republication, check the public page again.
8. Record the correction reason, approver, time, and external communication.

Do not delete incident evidence or logs in an attempt to hide the error.

## 16. Built-In AI Review and Rewriting Features

This section describes functionality inside the PressReady product. People operate it and remain responsible for every final decision.

At `/review`, a client or employee can submit text, a public source URL, or text extracted from a supported file; select Grok or DeepSeek; receive a structured review; and then explicitly request a rewrite. A review does not publish an article automatically, and a rewrite does not mean that the content has been approved.

Personnel must:

- Confirm that the company has the right to submit the input to the selected provider.
- Avoid sending unnecessary personal, confidential, or restricted information.
- Check facts, quotations, numbers, and meaning in the model output.
- Complete the normal editorial approval before publication.
- Monitor xAI/DeepSeek quotas, charges, model permissions, and outages.
- Never treat a provider response as legal, financial, or compliance advice.

The browser keeps the current source and successful rewrite turns only in the tab's session storage. This is not a complete account-level article-history system. Closing the tab or clearing browser data may remove it.

## 17. Public Presentation Editing

Only employees can edit public presentations. Draft and published settings are separate:

- **Save** stores a private draft and does not immediately change the public page.
- **Publish** updates the public presentation.
- **Discard** abandons the unpublished draft.
- Undo/redo applies only to the current editing workflow and is not a substitute for formal version history.

Presentation editing is suitable for text styling, fonts, sizes, colors, and the position or size of selected images. Correct source facts in the pipeline rather than concealing the problem only in the presentation layer.

## 18. Uploads and Private R2 Data

Supported formats include PDF, DOCX, PPTX, XLSX, PNG, JPEG/JPG, and WebP. The general limit is 50 files and 10 MiB total. The system validates the extension, MIME type, file signature, archive traversal, encryption, macros, archive bombs, and parsing duration.

The R2 binding is named `ACCOUNT_DOCUMENTS` and must remain private. Application attachments and news images use separate namespaces and should be served only through application routes that enforce authorization.

Personnel must not:

- Configure a public R2 URL or public domain for account-application attachments.
- Put private object keys into a public article or ticket.
- Keep downloaded attachments indefinitely on an unmanaged personal device.
- Bulk-delete objects before confirming the retention policy.

The company must complete policies for R2 lifecycle, orphan cleanup, backup, restore, access logging, and encrypted storage.

## 19. Architecture and Technical Components

| Layer | Technology/service | Purpose |
| --- | --- | --- |
| Web framework | Next.js 16 App Router | Pages, route handlers, and rendering |
| UI | React 19 | Interaction and server-rendered UI |
| Language | TypeScript 5.9 strict | Application and tests |
| Edge packaging | `@opennextjs/cloudflare` | Builds Next.js for Workers |
| Hosting | Cloudflare Workers | Production website runtime |
| Database | Cloudflare D1 | Accounts, sessions, articles, feeds, settings, and usage |
| Object storage | Cloudflare R2 | Private documents and images |
| Validation | Zod | Request and provider-response validation |
| Email | Resend API | Account lifecycle notifications |
| AI providers | xAI/DeepSeek | Built-in review, rewriting, image analysis, and summaries |
| Testing | Vitest, Testing Library, Miniflare | Code and Worker verification |
| Optional scraper | Python, Beautiful Soup, feedparser | External news collection and JSON ingestion |

Important Cloudflare runtime settings:

- Worker: `pressready-review`
- Entry point: `worker.ts`
- Compatibility date: `2026-07-28`
- D1 binding: `DB`
- R2 binding: `ACCOUNT_DOCUMENTS`
- Asset binding: `ASSETS`
- Cron: `0 0 * * *`
- CPU limit: 30,000 ms
- Subrequest limit: 1,000
- Observability: disabled in repository configuration

## 20. Source-Code Location Reference

| Path | Contents |
| --- | --- |
| `app/` | Pages and HTTP route handlers |
| `components/` | Interface components |
| `lib/client/` | Browser APIs, password proof, files, and session logic |
| `lib/server/agents/` | PressReady model clients, review/rewriting, and output validation |
| `lib/server/auth/` | Accounts, sessions, rate limits, usage, and email |
| `lib/server/feeds/` | Feeds, popularity grouping, pipeline, and diagnostics |
| `lib/server/sources/` | URL/DNS/redirect/SSRF protection and source retrieval |
| `lib/server/uploads/` | File validation, text extraction, image analysis, and storage |
| `lib/shared/` | Shared schemas, types, models, and categories |
| `migrations/` | D1 migrations `0001` through `0021` |
| `tests/` | Unit, component, route, and integration tests |
| `execution/` | Python scraper |
| `directives/` | Human operating procedure for the scraper |
| `scripts/` | Local/remote employee-account creation |
| `worker.ts` | Worker fetch and scheduled-ingestion handlers |
| `wrangler.jsonc` | Cloudflare bindings, variables, limits, assets, and cron |

## 21. Source Preservation Procedure

First perform a read-only inventory in each checkout:

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
git remote -v
git log --oneline --decorate -n 20
```

For the primary `News-platform/` checkout:

1. Preserve the complete `git status` output in an approved company handover record.
2. Review every diff without copying secrets into a shared record.
3. Determine which files are existing work and which are handover documents.
4. Create a clearly named preservation branch, for example:

```bash
git switch -c handover/wip-2026-08-19
```

5. Stage reviewed files individually; do not add everything without inspection.
6. Review the staged diff and secret exposure again.
7. Commit and push the preservation branch:

```bash
git commit -m "chore: preserve website handover state"
git push -u origin handover/wip-2026-08-19
```

8. Open a pull request that lists known limitations, incomplete testing, and uncertainty about correspondence with production.
9. Inventory unique commits and files in the two other checkouts before deciding whether to preserve, merge, or archive them.

These commands create branches, commits, and remote state. They must be run by an authorized person with GitHub access and company approval. Do not force-push `main`.

## 22. Secret and Configuration Transfer

The handover record may contain a secret's name, purpose, owner, and rotation date, but never its value.

Important names include:

- `AUTH_SECRET`
- `PASSWORD_PEPPER`
- `RESEND_API_KEY`
- `XAI_API_KEY`
- `DEEPSEEK_API_KEY`
- D1/R2 bindings and Cloudflare account access

For each item, record the service, purpose, production/test environment, company ownership, backup administrator, storage location, last rotation date, next review date, and related runbook.

Before rotating any secret:

1. Locate every use of the secret.
2. Confirm that the new value is already stored securely.
3. Prepare a rollback.
4. Determine whether the change will invalidate sessions, password proofs, email, or provider requests.
5. Select a maintenance window and notify affected personnel.
6. Run smoke tests immediately after the change.
7. Revoke the old value and record completion time.

`AUTH_SECRET` is additionally subject to the password-pepper risk described above and must not be handled as an ordinary independent secret.

## 23. Local Development Environment

The basic requirements are Node.js 22.13 or newer and npm. Python 3.12 or Docker is required only for the scraper. Miniflare/OpenNext tests require permission to bind to loopback.

```bash
cd "/path/to/news platform (real)/News-platform"
npm ci
cp .env.example .env.local
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Open <http://localhost:3000>.

Important notes:

- Do not commit `.env.local` or `.dev.vars`.
- Local email should use `APP_ENV=development` with `EMAIL_DELIVERY_MODE=preview`.
- Create a local employee with `npm run create-employee:local`.
- `npm run create-employee:remote` changes production data and requires approval.
- `npm run preview` normally serves <http://localhost:8787>.
- `listen EPERM 127.0.0.1` can indicate that a restricted environment prevents loopback binding; it does not necessarily indicate an application defect.

## 24. Testing and Quality Checks

Common checks:

```bash
npm run typecheck
npx eslint . --ignore-pattern '.tmp/**'
npm run test:unit
npm run build
npm run preview
python -m unittest discover -s execution/tests -v
```

Recorded as passing on 19 August 2026:

- TypeScript type checking.
- ESLint with the temporary `.tmp/**` exclusion.
- The production build.
- Eight focused test files containing 136 tests.
- Thirteen authentication integration tests.
- Relevant Miniflare tests in an environment where loopback was permitted.

Do not claim a complete pass for:

- The current one-command `npm test` release gate.
- A complete clean Vitest suite with no prolonged stall.
- Python scraper tests on the handover machine.

Known reasons include `.tmp/` lint scanning, a full suite that previously produced no output for a prolonged period, and the absence of the Python virtual environment/Beautiful Soup. Live model evaluations can incur charges and require product/finance approval.

## 25. Production Release Procedure

Deploy only from a clean, reviewed, and pushed commit. The release record must include the ticket, operator, reviewer, branch, commit SHA, pull request, migrations, backup, tests, rollback candidate, maintenance window, and communication channel.

Recommended order:

```bash
git status --short --branch
git rev-parse HEAD
npm ci
npx wrangler d1 migrations list pressready-auth --remote
mkdir -p .tmp/backups
npx wrangler d1 export pressready-auth --remote --output .tmp/backups/pressready-auth-YYYY-MM-DDTHHMM.sql
npm run typecheck
npx eslint . --ignore-pattern '.tmp/**'
npx vitest run --reporter=verbose
npm run build
npm run db:migrate:remote
npx wrangler d1 migrations list pressready-auth --remote
npm run deploy
npx wrangler deployments status --json
npx wrangler secret list
```

These commands read or change the remote production environment and must be run by an authorized person. A D1 export is sensitive data. Calculate a checksum, verify readability, move it to approved encrypted storage, and safely remove the local working copy when appropriate. Never commit it.

If a migration command returns an ambiguous result, inspect migration status before retrying. Do not rerun it blindly.

### Human Post-Release Smoke Test

- [ ] The home page opens.
- [ ] Technology and social-enterprise categories work.
- [ ] At least one public article works.
- [ ] The login and account-request pages work.
- [ ] The successor's employee account can sign in and open the employee area.
- [ ] The pipeline is readable and authorization is correct.
- [ ] A client cannot access employee-only functions.
- [ ] Logout removes access to protected pages.
- [ ] Feed settings and recent records can be read.
- [ ] Live AI or email is tested only with approved budget, test accounts, and recipients.

Finally record the Worker version, deployment ID, commit SHA, migration state, backup, every smoke-test result, any deviation, and the person monitoring the release.

## 26. Worker Rollback

List deployments first:

```bash
npx wrangler deployments list
```

Only after confirming a known-good version, schema compatibility, and the decision maker should an authorized person run:

```bash
npx wrangler rollback <known-good-version-id> --message "Rollback: <incident-id and reason>"
```

The historical version ID `f11dc00a-2621-43bd-8366-59e0ea3d444e` is reference information only. Do not assume it is still the correct rollback target without rechecking.

A Worker rollback does not restore:

- D1 migrations or data.
- R2 objects.
- Email already sent.
- Provider requests already made or charges already incurred.

After rollback, complete smoke tests, record the result, and notify affected personnel.

## 27. D1 Backup and Data Recovery

For a small, well-understood data problem, prefer a narrowly scoped reviewed repair. Consider point-in-time restore only for broad corruption.

Information and restore commands:

```bash
npx wrangler d1 time-travel info pressready-auth
npx wrangler d1 time-travel restore pressready-auth
```

Before restore:

1. Confirm the current Cloudflare retention window.
2. Write down the exact target date, time, and timezone.
3. List all valid writes after the target time that may be lost.
4. Take a fresh D1 export first.
5. Confirm that the target schema is compatible with the Worker.
6. Obtain approval from the data and incident decision functions.
7. Plan how to reconcile valid newer data.
8. Pause operations that would continue writing.

After restore, verify migrations, authentication, feeds, publication state, presentations, and R2 references. D1 restore does not automatically restore R2; verify them separately.

## 28. R2 Recovery Requirements

No automated R2 backup process was found in the repository. The company needs to establish and regularly test:

- Object inventory and checksums.
- An encrypted backup destination.
- Retention and deletion periods.
- Versioning or equivalent recovery capability.
- Orphaned-object cleanup.
- Restore testing into a non-production environment.
- Consistency checks against D1 references.

Until this policy exists, never assume that an R2 object can be recovered through D1 Time Travel.

## 29. Daily, Weekly, and Monthly Work

### Daily

- Check the home page, categories, and one public article.
- Review pending account applications.
- Review urgent corrections or complaints.
- Check pipeline freshness and feed errors.
- Review Resend, xAI, DeepSeek, and Cloudflare alerts.
- Record any suspension, removal, unpublishing, or production change.

### Weekly

- Review client suspensions and AI-usage thresholds.
- Review model charges, rate limits, and abnormal usage.
- Review Resend delivery, bounces, and domain status.
- Confirm the latest backup record and readability.
- Address persistently failing feeds.
- Confirm that recent releases are traceable to commits.
- Confirm that on-call and backup contacts are reachable.

### Monthly

- Review privileged access and departed accounts.
- Confirm that at least two company Cloudflare administrators remain available.
- Test company password-manager recovery.
- Run or schedule D1/R2 restore tests.
- Review data retention and deletion policy.
- Review model usage and suspension thresholds.
- Review CI, test, and deployment records.
- Update contacts and this manual.

## 30. Monitoring and Logs

Observability is currently disabled in `wrangler.jsonc`, and no durable repository-defined log, metric, and alert pipeline was found. Tail live Worker logs with:

```bash
npx wrangler tail pressready-review --format pretty
```

At minimum, monitor Worker error rate, latency, CPU and subrequests; route 4xx/5xx; authentication and rate-limit anomalies; email accepted/failed/bounced; model errors, latency, and spend; feed success and lateness; D1 errors/migrations; R2 failures; article publication/unpublishing; backup completion; and restore tests.

Never log API keys, passwords, password proofs, raw tokens, full private drafts, attachments, D1 exports, or unbounded provider responses.

## 31. Incident: Total Outage or Widespread 5xx

1. Confirm from a second network or device rather than relying only on one browser.
2. Record the start time, routes, status codes, region, and screenshots.
3. Check Cloudflare status, the latest deployment, migrations, secret changes, and Worker logs.
4. Determine whether static pages, dynamic routes, D1, or the entire system is affected.
5. Freeze nonessential changes.
6. Preserve logs and a timeline.
7. Have the incident decision function choose between a fix and rollback.
8. Roll back only when schema compatibility is understood.
9. Complete smoke tests and update affected personnel at the agreed interval.

## 32. Incident: All Users Cannot Sign In

1. Confirm separately whether both employees and clients are affected.
2. Check recent changes to `AUTH_SECRET`, `PASSWORD_PEPPER`, session TTL, deployment, and migrations.
3. Do not rotate another secret.
4. If the pepper changed, evaluate restoring a compatible pepper or coordinating password setup for all accounts.
5. Check sessions, user status, manual/automatic suspensions, and expiry.
6. After repair, test with employee and client test accounts.
7. Record the root cause, impact, and prevention work.

For a single user, check normalized email, setup state, active/disabled state, suspensions, and rate limits. Do not view or reset another person's password; use the formal setup, resend, or recovery process.

## 33. Incident: Email, Model Provider, or Abnormal Spend

### Email

Check the recipient, message type, D1 delivery metadata, Resend status, billing, domain, suppression state, sender configuration, and secret name. Resend a protected link only after the issue is fixed and only to an approved recipient.

### Built-In Model Functionality

Record the model, stage, safe debug ID, time, and affected scope. Distinguish xAI from DeepSeek. Check provider status, billing, rate limits, model permission, endpoint, and redacted diagnostics. Switch providers only where company policy allows it.

### Abnormal Spend

Notify product, engineering, security, and finance immediately. Review D1 usage and provider dashboards. Identify the client, route, model, time window, automation, or possible key leak. When necessary and approved, suspend an account, change an audited threshold, or rotate a provider key, while preserving billing evidence.

## 34. Incident: Private Document or Data Disclosure

1. Treat the event as both a security and privacy incident.
2. Preserve timestamps, route, object key, log ID, and affected scope.
3. Check R2 public settings and application authorization.
4. Stop unsafe access without deleting investigation evidence.
5. Determine the affected people, data types, and exposure period.
6. Notify company security, privacy, and legal contacts.
7. Decide notification and remediation according to company and legal requirements.
8. If necessary, rotate relevant credentials, revoke sessions, and repair the route.

## 35. Minimum Security and Privacy Requirements

Existing code includes server-only keys, model allowlists, Zod schemas, server-side role checks, same-origin/CSRF defenses, avoidance of raw setup-token storage, scrypt plus pepper, login rate limiting, session revocation, private R2 storage, upload/archive defenses, URL/DNS/redirect SSRF checks, and security headers.

The successor team should prioritize:

- Establishing an independent and stable `PASSWORD_PEPPER` approach.
- Adding protected CI/CD and a service identity.
- Creating durable redacted logs, metrics, and alerts.
- Automating encrypted D1/R2 backups and restore tests.
- Verifying a company Resend domain.
- Confirming company custom-domain, TLS, and DNS ownership.
- Conducting regular dependency and vulnerability reviews.
- Defining retention for unpublished drafts, application attachments, logs, usage records, and backups.
- Establishing data-subject access, correction, and deletion procedures.
- Applying least privilege to Cloudflare, GitHub, Resend, and model-provider roles.

## 36. Known-Risk Table

| Risk | Impact | Required action | Status |
| --- | --- | --- | --- |
| GitHub is missing local work | The system cannot be reconstructed or audited | Preserve all three checkouts and open a safety PR | Open |
| Live deployment lacks a reliable Git SHA | Releases and rollback are difficult to audit | Record the commit for every deployment | Open |
| No protected CI/CD | Manual error and personal-access risk | Establish a protected pipeline | Open |
| No independent `PASSWORD_PEPPER` | Secret rotation can invalidate passwords | Design and test a migration | Open |
| Resend uses a test sender | Ordinary recipients may not receive email | Verify a company domain | Open |
| Observability is disabled | Historical incident evidence is weak | Establish redacted monitoring | Open |
| `npm test` release gate is unreliable | Defects may be missed | Fix `.tmp/**` handling and add suite timeout | Open |
| Scraper test environment is absent | Scraper changes cannot be verified | Establish a pinned virtual environment/CI | Open |
| No automated D1/R2 backup | Data-recovery risk | Add encrypted backup and restore drills | Open |
| DNS rebinding/egress gap | SSRF risk | Review resolver-pinning egress controls | Open |
| Provider dependence | Outage, price, and model-change risk | Configure alerts and a fallback policy | Open |
| Documentation can become stale | A successor may follow obsolete procedure | Define update triggers | Open |

A known risk is not automatically an accepted risk. Any delayed item should have a formal risk-acceptance record.

## 37. Final Departure-Day Checklist

### People and Access

- [ ] All accountable, day-to-day, and backup roles have been completed.
- [ ] Incident and out-of-hours contact methods have been tested.
- [ ] The successor has signed in to GitHub, Cloudflare, Resend, xAI, DeepSeek, billing, and the password manager using their own company account.
- [ ] At least two company personnel have working Cloudflare administration/recovery access.
- [ ] Billing and security alerts are routed to a monitored company address.

### Source Code

- [ ] All three local checkouts have been preserved and inventoried.
- [ ] The 14 local commits have been safely preserved.
- [ ] The 17 modified tracked files and all untracked files have been reviewed individually.
- [ ] A secret review has been completed.
- [ ] A safety branch has been pushed and a pull request opened.
- [ ] The commit closest to the live Worker and every uncertain difference have been recorded.

### Data and Recovery

- [ ] D1 migration status has been queried again.
- [ ] A current D1 export has been created, checksummed, confirmed readable, and moved to approved encrypted storage.
- [ ] D1 retention and restore procedures have been assigned within the company.
- [ ] R2 backup, retention, and restore procedures have been assigned within the company.
- [ ] The `PASSWORD_PEPPER` plan has been approved before any `AUTH_SECRET` rotation.

### Operational Demonstration

- [ ] Account approval, rejection, and setup-link resend have been demonstrated.
- [ ] Client suspension and recovery have been demonstrated; removal has been explained but not tested on a real account.
- [ ] Feed pause, resume, and manual fetch have been demonstrated.
- [ ] Pipeline ingestion, editing, review, publication, correction, and unpublishing have been demonstrated.
- [ ] The difference between presentation **Save**, **Publish**, and **Discard** has been demonstrated.
- [ ] Model usage, charges, and human-review responsibilities have been explained.
- [ ] Release records, Worker logs, rollback decisions, and D1 restore prerequisites have been demonstrated.

### Departure Processing

- [ ] Handover documents, Git, tickets, and chat contain no secrets or private data.
- [ ] The successor can perform critical work independently.
- [ ] A second person has tested company recovery.
- [ ] The departing employee's personal tokens, sessions, devices, and roles were revoked only after all prior conditions passed.
- [ ] Company-account login and recovery were tested again after revocation.

## 38. Successor's First-Month Plan

### First Day

- Read the risks and stop conditions in this manual.
- Complete all access tests.
- Complete public-page, login, and employee-area smoke tests.
- Locate the company password manager, backups, billing, incident records, and change records.
- Do not change production on the first day unless responding to an active incident.

### First Three Days

- Have the departing employee or current operator demonstrate the account lifecycle.
- Personally perform a safe feed, pipeline, and publication exercise.
- Review model-provider usage and Resend status.
- Read recent deployment, migration, and incident records.
- Confirm D1/R2 backups and contacts.

### First Week

- Complete preservation and pull requests for all local source work.
- Compare all three checkouts.
- Match the live Worker to the closest commit.
- Fix or schedule the lint/full-test issues.
- Establish the Python scraper test environment.
- Decide the Resend-domain, password-pepper, backup, and observability plans.

### First 30 Days

- Establish protected CI/CD linked to commits.
- Give the complete test suite a clear timeout and unambiguous result.
- Enable appropriate logs, metrics, and alerts.
- Establish automated encrypted backups and a non-production restore drill.
- Complete the `PASSWORD_PEPPER` plan.
- Verify the company email sender/domain.
- Review SSRF egress, firewall controls, and rate limiting.
- Update stale documentation, decide on a custom domain, and rehearse Worker rollback and data recovery.

## 39. Final Sign-Off

Each signatory should confirm that they have read the sections relevant to their role, personally tested the access they require, and understand the unresolved risks.

| Role | Name | Date and time (HKT) | Confirmation | Signature/internal evidence |
| --- | --- | --- | --- | --- |
| Departing employee | **To be completed** | **To be completed** | Known system, source, and operational information has been handed over | **To be completed** |
| New technical lead | **To be completed** | **To be completed** | Source has been preserved and technical access tested | **To be completed** |
| Editorial lead | **To be completed** | **To be completed** | Publication, correction, and unpublishing procedures are understood | **To be completed** |
| Management | **To be completed** | **To be completed** | Ownership has been assigned and unresolved risks addressed or accepted | **To be completed** |
| Security lead | **To be completed** | **To be completed** | Secret, incident, and revocation procedures are understood | **To be completed** |
| Privacy/data lead | **To be completed** | **To be completed** | Retention, attachment, and removal procedures are understood | **To be completed** |

## 40. Maintaining This Manual

The company must assign a document owner. Update this manual after:

- A production deployment or migration.
- A Worker, D1, R2, Resend, xAI, or DeepSeek configuration change.
- A change to login, sessions, secrets, pepper handling, or roles.
- A change to account, feed, pipeline, publication, presentation, or upload workflows.
- A new backup, restore, or incident-drill result.
- A change to contacts, provider ownership, or billing responsibility.
- An incident produces new operational knowledge.
- Another employee departure or ownership transfer.

Every production statement must include the date on which it was checked. Preserve Git history or company document-version history for updates. Never add secrets, one-time links, private attachments, full database exports, or personal information to this manual.

Supplementary references:

- [Traditional Chinese human-only handover](WEBSITE_HANDOVER_HUMAN_ONLY_ZH-HK.md)
- [Traditional Chinese detailed technical handover](WEBSITE_HANDOVER_DETAILED_ZH-HK.md)
- [English detailed technical handover](WEBSITE_HANDOVER_DETAILED.md)
- [English shorter technical handover](WEBSITE_HANDOVER.md)
- [English plain-language handover](WEBSITE_HANDOVER_PLAIN_LANGUAGE.md)

If a supplementary document differs from the current code or production environment, stop any destructive operation, re-verify the current state, and update a dated record. Never allow an undated old document to override observed reality.
