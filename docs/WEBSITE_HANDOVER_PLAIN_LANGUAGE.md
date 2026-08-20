# PressReady website handover: simple step-by-step guide

**Prepared:** 19 August 2026, Hong Kong time  
**For:** Managers, editors, administrators, and other people without a technical background  
**Live website:** <https://pressready-review.931smd-cloudflare-account.workers.dev>  
**Detailed technical guide:** [PressReady website handover](WEBSITE_HANDOVER.md)

This guide explains what the PressReady website does, what must be transferred
when an employee leaves, and how to perform common tasks safely. You do not need
to understand programming to use this guide.

Some information below is dated. Website content, user numbers, service
settings, and deployment numbers may change after 19 August 2026. Ask the named
technical owner to recheck them before making an important change.

## If you only have 10 minutes, do these things

1. Write the names and contact details of the new owners in the ownership table
   below.
2. Ask each new owner to sign in using their own company account. Watching the
   departing employee sign in is not enough.
3. Make sure the current website code is copied safely to GitHub. At the time of
   this handover, GitHub does not contain all local work.
4. Do not delete any of the three website folders on the departing employee's
   computer until a technical person has reviewed and backed them up.
5. Do not change or rotate `AUTH_SECRET`. Changing it now may stop every current
   user from signing in.
6. Do not remove a client account unless permanent deletion is intended and
   approved. Removal deletes the client's related information.
7. Do not revoke the departing employee's access until the successor has proved
   that their own access works.

## What PressReady does

PressReady is a news publishing and AI-assisted writing website. It has four
main areas:

| Area | Who uses it | What it is for |
| --- | --- | --- |
| Public newsroom | Anyone | Reading articles that employees have approved and published |
| Review workspace | Approved clients and employees | Asking an AI service to review or rewrite a draft |
| Editorial pipeline | Approved clients and employees | Receiving news items, preparing articles, adding images, and publishing |
| Admin Panel | Employees only | Approving accounts, managing users, controlling usage, and managing news feeds |

The main pages are:

| Page | Address |
| --- | --- |
| Public homepage | <https://pressready-review.931smd-cloudflare-account.workers.dev> |
| Sign in | <https://pressready-review.931smd-cloudflare-account.workers.dev/login> |
| Request an account | <https://pressready-review.931smd-cloudflare-account.workers.dev/request-account> |
| AI review workspace | <https://pressready-review.931smd-cloudflare-account.workers.dev/review> |
| Editorial pipeline | <https://pressready-review.931smd-cloudflare-account.workers.dev/pipeline> |
| Employee Admin Panel | <https://pressready-review.931smd-cloudflare-account.workers.dev/employee> |
| Technology articles | <https://pressready-review.931smd-cloudflare-account.workers.dev/technology> |
| Social Enterprise articles | <https://pressready-review.931smd-cloudflare-account.workers.dev/social-enterprise> |

## The four types of people involved

### Visitor

A visitor can read public articles and request an account. A visitor cannot use
the private tools.

### Client

An approved client can sign in, review and rewrite drafts, and use the editorial
pipeline. A client cannot open employee-only administration pages.

### Employee

An employee can use the client tools and the Admin Panel. Employees can approve
accounts, manage feeds, publish articles, change public presentation, suspend or
recover clients, and permanently remove clients.

### Technical owner

The technical owner maintains the code, Cloudflare services, database, file
storage, deployments, backups, logs, and security settings. A non-technical
manager should approve important business decisions, but should ask the
technical owner to carry out deployments, database restoration, secret changes,
or code recovery.

## Safety rules

Follow these rules even during an emergency:

1. **Never send passwords or secret keys in email, chat, tickets, or this
   document.** Store them in the company password manager.
2. **Never use the departing employee's personal account as the permanent
   company account.** Create or confirm company-controlled accounts.
3. **Never delete the local website folders to “clean up” the computer.** Some
   work exists only on that computer.
4. **Never press “Remove account” as a temporary measure.** Use “Suspend
   client” when temporary blocking is required.
5. **Never publish AI text without a human checking it.** Check names, dates,
   numbers, quotations, links, images, and the original source.
6. **Never deploy code from an unknown folder or an unreviewed copy.** The
   technical owner must use the canonical `News-platform/` folder.
7. **Never restore the database or rotate authentication secrets without a
   written plan and approval.** These actions can remove data or stop users from
   signing in.
8. **Stop when unsure.** Record what you saw, take screenshots that do not show
   private data, note the Hong Kong time, and contact the technical owner.

## Step 1: Assign owners before the employee leaves

Do not write passwords in this table. Write the person's name, company email,
and company account name only.

| Responsibility | New owner | Company email or shared account | Signed in successfully? |
| --- | --- | --- | --- |
| Final product decisions | ____________________ | ____________________ | [ ] |
| Editorial work and corrections | ____________________ | ____________________ | [ ] |
| Technical maintenance | ____________________ | ____________________ | [ ] |
| GitHub source-code administration | ____________________ | ____________________ | [ ] |
| Cloudflare website administration | ____________________ | ____________________ | [ ] |
| Resend email administration | ____________________ | ____________________ | [ ] |
| xAI/Grok account and billing | ____________________ | ____________________ | [ ] |
| DeepSeek account and billing | ____________________ | ____________________ | [ ] |
| Emergency contact | ____________________ | ____________________ | [ ] |
| Personal-data and privacy requests | ____________________ | ____________________ | [ ] |
| Company password manager | ____________________ | ____________________ | [ ] |

For each row:

1. Choose one main owner and one backup owner where possible.
2. Create or confirm a company-controlled account for the owner.
3. Ask the owner to sign in on their own device.
4. Ask the owner to open the correct company workspace, not just the provider's
   general homepage.
5. Confirm that the owner can see the required project, billing area, or
   settings page.
6. Tick the box only after the test succeeds.
7. Record where support requests should be sent outside office hours.

You can send this message to each successor:

> Please sign in to the assigned PressReady service using your own company
> account. Confirm that you can see the PressReady project and the settings you
> are expected to manage. Do not send me your password or any secret key. Reply
> with “access confirmed,” the service name, and the date and time.

## Step 2: Understand the outside services

The website depends on several separate companies. Losing access to one of them
can break part of the website.

| Service | Plain-language meaning | What happens if access is lost |
| --- | --- | --- |
| GitHub | The company library that should hold the website's source code and history | The team may be unable to maintain or recover the website safely |
| Cloudflare | Runs the live website and holds its database and private files | The website, accounts, articles, or uploaded files may become unavailable |
| Resend | Sends account and suspension email | New users may not receive setup email, and client notices may fail |
| xAI | Supplies the Grok AI model | Grok review and rewriting stop working |
| DeepSeek | Supplies the DeepSeek AI model | DeepSeek review and rewriting stop working |
| Password manager | Safely stores company credentials and recovery information | Staff may lose access or start sharing secrets unsafely |

The important current names are:

| Item | Current name or address |
| --- | --- |
| GitHub repository | <https://github.com/Hello000123/News-platform> |
| Cloudflare account | `931SMD Cloudflare Account` |
| Cloudflare website name | `pressready-review` |
| Cloudflare database | `pressready-auth` |
| Cloudflare private-file bucket | `pressready-account-documents` |
| Current Cloudflare login used by the command-line tool | `info@931smd.com` |

These names are not passwords, but they still belong in company records rather
than public documents.

## Step 3: Perform a simple first-day health check

Do this after access is transferred and at the start of the successor's first
working day.

### Public checks

1. Open the public homepage in a private or incognito browser window.
2. Confirm that the PressReady page loads without a browser error.
3. Open the Technology and Social Enterprise pages.
4. Open one published article.
5. Check that the headline, body, and image look correct.
6. Record the date, Hong Kong time, and result.

### Employee checks

1. Open the sign-in page.
2. Sign in with the successor's employee account.
3. Open the **Admin Panel**.
4. Confirm that the tabs **Account Approval**, **Client Accounts**, **Client
   Overview**, **Employee Accounts**, and **News Feeds** are visible.
5. Open the editorial pipeline.
6. Confirm that the article list loads.
7. Sign out.

### Do not include these in a routine health check

- Do not publish a test article to the public homepage.
- Do not send a real account email unless the recipient and email test are
  approved.
- Do not ask an AI model to generate text unless use of paid credits is
  approved.
- Do not suspend or remove a real client.

Use this record:

| Check | Result | Date and HKT time | Checked by | Notes or ticket |
| --- | --- | --- | --- | --- |
| Public homepage | Pass / Fail | __________ | __________ | __________ |
| Category pages | Pass / Fail | __________ | __________ | __________ |
| Published article | Pass / Fail | __________ | __________ | __________ |
| Employee sign-in | Pass / Fail | __________ | __________ | __________ |
| Admin Panel | Pass / Fail | __________ | __________ | __________ |
| Editorial pipeline | Pass / Fail | __________ | __________ | __________ |

## Step 4: Handle a new account request

Only an authorized employee should approve or reject accounts.

1. Sign in with an employee account.
2. Open the **Admin Panel**.
3. Select **Account Approval**.
4. Select the **Pending** filter.
5. Open the request.
6. Confirm that the person and company are expected to use PressReady.
7. Review any supporting files carefully. They may contain private information.
8. If information is missing or suspicious, stop and contact the product or
   privacy owner. Do not approve “just to test.”
9. Choose **Approve** or **Reject** and follow the on-screen confirmation.
10. Check the recorded email-delivery result.
11. If an approved user's setup email fails, correct the email service problem
    and use the protected resend action in the Admin Panel. Do not copy a setup
    link into an ordinary chat.
12. Record who made the decision and why in the company's approved record.

Approved clients receive a one-time link to create their password. Employees do
not know or choose the client's password.

## Step 5: Suspend or recover a client safely

Use suspension when access should be blocked temporarily but the client's data
must remain.

### Suspend a client

1. Sign in as an employee and open the **Admin Panel**.
2. Select **Client Accounts**.
3. Search for and carefully confirm the correct client.
4. Select **Suspend client**.
5. Enter a clear business reason.
6. Read the email preview and check that it does not expose internal or private
   information.
7. Confirm the action.
8. Check whether the notification email was accepted.
9. Record the reason, approver, date, Hong Kong time, and related ticket.

Suspension ends the client's existing sessions and blocks later sign-in. The
client's stored information remains.

### Recover a client

1. Open **Admin Panel** → **Client Accounts**.
2. Confirm the correct suspended client.
3. Read the suspension reason and check that recovery is authorized.
4. Select **Recover account**.
5. Confirm the action.
6. Ask the client to sign in with the existing password.
7. Record the recovery decision.

### Permanently remove a client

**This is not the same as suspension. It is a destructive action.** Removal
deletes the client's account and related stored information.

1. Obtain written approval from the authorized business and data owner.
2. Confirm whether any legal, audit, complaint, or retention requirement applies.
3. Export or preserve only what the company is legally allowed and required to
   retain.
4. Open **Admin Panel** → **Client Accounts**.
5. Check the client's identity at least twice.
6. Select **Remove account**.
7. Read the warning and notification message.
8. Type the exact client name only when permanent deletion is intended.
9. Confirm the action.
10. Record the approval and result outside the deleted account.

If there is any doubt, cancel and use suspension instead.

## Step 6: Prepare and publish a news article

Every article must receive human editorial review. AI output is a draft, not a
verified fact source.

1. Sign in and open the **Editorial pipeline**.
2. Choose an article from the list.
3. Under **Review the reporting**, open and read the original source.
4. If the page says **RSS preview (incomplete)** or no full source is available,
   do not assume the preview contains the complete facts. Open the original
   publisher page or obtain a reliable full source.
5. Under **Prepare the homepage story**, choose one of these approaches:
   - Select **Rewrite draft** to create an editable AI draft without publishing.
   - Write or edit the headline and body manually.
   - Avoid **Rewrite & publish** unless the team has approved an immediate
     publish workflow and a human will still verify the result.
6. Check the public headline.
7. Check every name, organization, date, number, price, unit, and quotation
   against the original source.
8. Remove unsupported claims and promotional wording.
9. Select the public category, or leave it as **Homepage only** when appropriate.
10. Add a featured image only when the company has permission to use it.
11. Add accurate image credit or source information where required by company
    policy.
12. Select **Save changes** if another person must review the draft.
13. Ask the authorized editor for final approval.
14. Select **Publish to homepage** only after approval.
15. Select **View live post** and check the public result on desktop and mobile.
16. Record the article link, editor, approver, and publication time.

For an already published article, the publish button becomes **Update
homepage**. Use **Unpublish** when the article must be removed from public view.
Record why it was updated or unpublished.

## Step 7: Change how a public page looks

Employees can change text formatting and image presentation on public pages.

1. Sign in as an employee.
2. Open the relevant public page or article.
3. Enter the restricted presentation editor using the employee editing action.
4. Edit words directly, or select text and use the **Home** ribbon.
5. Select an image before changing its size.
6. Use **Save** to keep a private draft that visitors cannot see.
7. Ask another person to check the draft.
8. Use **Publish** only when the changes are ready for the public.
9. Open the normal public page and check the result.
10. Use **Discard** only when you intend to abandon the unpublished changes.

The page structure is deliberately locked. If a new section or layout is
needed, ask the technical owner rather than forcing it through the editor.

## Step 8: Check and manage news feeds

News feeds bring outside articles into the editorial pipeline. They do not
publish articles automatically.

At the time of this handover, Cloudflare starts a scheduled check at 08:00 Hong
Kong time each day. The database schedule must also be enabled. Treat this as a
dated setting and ask the technical owner to recheck it after any configuration
change.

### Routine feed check

1. Open **Admin Panel** → **News Feeds**.
2. Check whether **Automatic feed polling** is enabled.
3. Check the “Last fetched” time.
4. Look for **Last fetch failed** labels or error messages.
5. Open the editorial pipeline and confirm that recent items arrived.
6. If one feed is stale, select **Fetch now** for that feed.
7. If all feeds are stale, select **Fetch all feeds now** once.
8. Wait for the result. Do not repeatedly press the button.
9. Record the name of any failed feed, the exact error, and the time.
10. Send that information to the technical owner.

### Feed action meanings

| Button | Meaning | Risk |
| --- | --- | --- |
| Fetch now | Ask one feed for its latest items | Low, but repeated fetching may trigger limits |
| Fetch all feeds now | Ask every active feed for latest items | May create load; use once and wait |
| Edit | Change a feed's name or address | A wrong address stops that feed working |
| Pause | Temporarily stop fetching that feed | Safe way to stop a broken source |
| Resume | Start fetching a paused feed again | Use only after the source is known to work |
| Remove | Delete the feed and its pipeline articles | Destructive; obtain approval first |

Some publishers intentionally block automated access. Do not attempt to bypass
their protection. Leave those feeds paused and ask the technical owner to check
the source notes in `directives/scrape_news.md`.

## Step 9: Perform routine checks

### Every working day

- [ ] Open the public homepage and one article.
- [ ] Check pending account requests.
- [ ] Check whether the pipeline has recent articles.
- [ ] Check for failed feed messages.
- [ ] Review reports of incorrect or harmful published content.
- [ ] Record incidents, corrections, and account decisions.

### Every week

- [ ] Review client accounts and unexpected suspensions.
- [ ] Review AI usage and provider spending.
- [ ] Confirm that notification email is being received.
- [ ] Confirm that the named owners and emergency contacts are still available.
- [ ] Ask the technical owner whether backups and release records completed.
- [ ] Review unresolved errors rather than allowing them to become normal.

### Every month

- [ ] Remove access for people who no longer need it, after approval.
- [ ] Confirm at least two company-controlled Cloudflare administrators exist.
- [ ] Review GitHub, Cloudflare, Resend, xAI, and DeepSeek billing contacts.
- [ ] Review backup retention and one recent restore test record.
- [ ] Review AI spending limits and automatic client-suspension settings.
- [ ] Review the incident contact list and this handover for outdated facts.

## Step 10: Respond when something goes wrong

### The whole website is unavailable

1. Check the public homepage from a second network or phone.
2. Write down the exact error, affected page, and Hong Kong time.
3. Take a screenshot without exposing private account information.
4. Check whether a deployment or database change happened shortly before the
   problem.
5. Contact the technical owner and Cloudflare owner.
6. Do not redeploy repeatedly.
7. Do not restore the database yourself.
8. Ask the technical owner to follow the rollback and recovery section in the
   [technical handover](WEBSITE_HANDOVER.md#rollback-and-recovery).

### All existing users suddenly cannot sign in

1. Ask whether anyone changed `AUTH_SECRET` or `PASSWORD_PEPPER`.
2. Tell people not to keep changing the secrets.
3. Record when the problem began.
4. Contact the technical owner immediately.
5. The technical owner must either restore the compatible password setting or
   coordinate password setup again for every account.

### Account email is not arriving

1. Confirm the recipient address.
2. Check the email-delivery result in the Admin Panel.
3. Ask the recipient to check spam or junk folders.
4. Contact the Resend owner.
5. Confirm that the sending address belongs to a verified company domain.
6. After the problem is fixed, use the protected resend action in the Admin
   Panel.

At handover time the website uses `onboarding@resend.dev`, which is a testing
sender and is not suitable for normal delivery to all recipients.

### AI review or rewriting is failing

1. Record whether the user selected Grok or DeepSeek.
2. Record the time and safe error/reference number. Do not copy private article
   text into a public ticket.
3. Check whether only one AI provider is affected.
4. Ask the relevant provider owner to check service status, billing, and usage.
5. Switch to the other approved model only when company policy allows it.
6. Never paste a provider secret key into the browser or a support ticket.

### AI spending is unexpectedly high

1. Notify the product, technical, and billing owners.
2. Review which client and time period caused the increase.
3. Temporarily suspend the affected client if misuse is suspected and approval
   exists.
4. Review the automatic usage limits in the Admin Panel.
5. Ask the provider owner to secure the account if a key may be compromised.
6. Record the incident and the business decision.

### News feeds are stale

1. Follow the feed check in Step 8.
2. Try one controlled manual fetch.
3. Pause only the failing source if other sources work.
4. Send the feed name, address, error, and time to the technical owner.
5. Do not bypass publisher protection or repeatedly retry a blocked source.

### A public article is wrong or unsafe

1. Save the public link and a screenshot for the incident record.
2. Ask the authorized editor whether to correct or unpublish it immediately.
3. Open the article in the pipeline.
4. Use **Unpublish** if it must leave public view.
5. Correct the source-backed content and obtain approval before republishing.
6. Record what changed, why, who approved it, and when.

## Step 11: Request a safe website release

A **release** or **deployment** means putting new website code into production.
Non-technical staff should use this checklist to approve and record a release;
the technical owner should run it.

### Before deployment

- [ ] The requested change and business reason are written down.
- [ ] The exact code branch and commit are identified.
- [ ] Another qualified person reviewed the changes.
- [ ] No password, API key, private document, or database export is in Git.
- [ ] The database was exported before a database or destructive change.
- [ ] Type checking, linting, relevant tests, and the production build passed.
- [ ] Any test that did not run is written down and accepted by an approver.
- [ ] A rollback owner and decision-maker are available.
- [ ] The deployment time and expected user impact are communicated.

### After deployment

1. Open the homepage, category pages, and one live article.
2. Check sign-in and account-request pages.
3. Ask an employee to open the Admin Panel and pipeline.
4. Confirm that a client cannot open employee-only pages.
5. Confirm feed settings and last-fetch information.
6. Record the Git commit, Cloudflare version, person, date, time, database
   changes, and health-check result.
7. If a serious problem appears, stop further changes and contact the technical
   owner. A website rollback does not automatically reverse database or file
   changes.

Do not use real AI generation or email delivery as a release test unless the
test account, recipient, budget, and expected result are approved.

## Step 12: Preserve the website code

This is the most urgent technical handover item.

The correct local folder is `News-platform/`. On 19 August 2026 it contained 14
commits that were not yet on GitHub, plus additional uncommitted files. GitHub
was therefore not a complete backup.

Two other folders also contain different unfinished work:

- `News-platform-latest/`
- `AI-Agent-News-Review-Rewrite/`

The manager should give a qualified technical person this instruction:

> Preserve all three folders. Use `News-platform/` as the canonical starting
> point. Review every change for secrets, create a separate handover branch,
> commit only reviewed files, push the branch to the company GitHub repository,
> and open a pull request. Do not reset, clean, force-push, delete, or deploy
> from any folder until the differences have been reviewed.

Ask the technical person to provide:

- [ ] The safety branch name.
- [ ] The latest commit identifier.
- [ ] The GitHub pull-request link.
- [ ] A list of files deliberately not committed and why.
- [ ] Confirmation that no secrets were included.
- [ ] The best match between the reviewed commit and the live website version.

## Known problems that management must track

| Problem | Why it matters | Who should act |
| --- | --- | --- |
| GitHub is missing local work | The website cannot be fully recovered from GitHub | Technical owner, urgently |
| The live deployment is not clearly linked to a Git commit | The team cannot easily prove what code is live | Technical owner before the next deployment |
| `AUTH_SECRET` is also being used for password protection | Rotating it can make all passwords stop working | Security and technical owners before secret rotation |
| The email sender is a Resend test address | Normal account email may not reach all recipients | Resend and technical owners |
| No automated release process was found | Deployments depend on manual steps and are easier to misrecord | Technical owner and management |
| Persistent Cloudflare observability is disabled | Investigating past incidents may be difficult | Technical owner |
| No automated database/file backup process was found in the repository | Recovery may depend on manual exports and provider retention | Technical and data owners |
| The main `npm test` command is not a reliable release gate | A technical person must use the documented workaround and repair it | Technical owner |
| The complete test suite has not been confirmed in one clean run | Some defects may be missed without a stable test process | Technical owner |
| The optional news scraper test environment is incomplete | Scraper changes cannot be fully checked on the current machine | Technical owner |
| Some existing documents are outdated | New staff may receive conflicting instructions | Technical owner and document owner |
| No custom company domain is configured | Users depend on a long `workers.dev` address | Product and technical owners |

## Departure-day checklist

The departing employee, successor, and manager should complete this together.

### People and access

- [ ] Every ownership-table row has a named person.
- [ ] Each successor signed in using their own company account.
- [ ] At least two company-controlled Cloudflare administrators exist.
- [ ] Billing and recovery contacts belong to the company.
- [ ] The emergency contact and after-hours process are written down.
- [ ] Password-manager records are complete and accessible.

### Website and data

- [ ] The public and employee health checks passed.
- [ ] The canonical code and all three local folders were preserved.
- [ ] The missing local commits and reviewed unfinished work were pushed safely.
- [ ] The live website version was matched to the closest reviewed code commit.
- [ ] A current database export was moved to approved encrypted storage.
- [ ] The company decided how private stored files will be backed up.
- [ ] Backup retention and recovery responsibility are written down.

### Security and providers

- [ ] The password-secret migration plan was approved before any secret change.
- [ ] Resend uses a verified company sending domain or has a dated correction plan.
- [ ] xAI and DeepSeek billing and usage alerts have company owners.
- [ ] Personal tokens and sessions are revoked only after successor access works.
- [ ] No secret values appear in the handover, GitHub, chat, email, or tickets.

### Sign-off

| Role | Name | Date | Signature or approved record link |
| --- | --- | --- | --- |
| Departing employee | ____________________ | __________ | ____________________ |
| New technical owner | ____________________ | __________ | ____________________ |
| New editorial owner | ____________________ | __________ | ____________________ |
| Manager | ____________________ | __________ | ____________________ |
| Data/privacy owner | ____________________ | __________ | ____________________ |

## First week for the successor

### Day 1

1. Complete the ownership and access table.
2. Perform the simple health check.
3. Join the incident and support channels.
4. Confirm where credentials, backups, invoices, and release records are stored.
5. Do not make a production change on the first day unless an active incident
   requires it and the technical owner approves it.

### Days 2–3

1. Ask the departing employee to demonstrate account approval, client
   suspension/recovery, feed checking, article publishing, and correction.
2. Perform each safe routine using a test or approved record.
3. Review outstanding incidents, blocked feeds, billing alerts, and client
   requests.
4. Confirm the current database and private-file backup position.

### Days 4–5

1. Confirm that all code is preserved in GitHub through a reviewed pull request.
2. Confirm which reviewed commit best matches production.
3. Agree on owners and dates for every problem in the management table.
4. Schedule the password-secret fix, verified email sender, backup process,
   observability, and automated release work.
5. Update this guide if any name, page, button, schedule, or service has changed.

## Information that must never be written here

Do not add any of the following to this file:

- Passwords.
- API keys or secret values.
- Login cookies or session identifiers.
- One-time password-setup links.
- Full database exports.
- Private account applications or uploaded documents.
- Private article drafts or confidential source material.
- Personal information that is not necessary for ownership records.

Use the company password manager and approved encrypted storage instead.

## Simple glossary

| Term | Meaning |
| --- | --- |
| Production | The live website used by real people |
| Source code | The files that tell the website how to work |
| GitHub | A service that stores and tracks source-code history |
| Commit | A named saved point in source-code history |
| Branch | A separate line of work used before changes are accepted |
| Pull request | A review page for checking code before it is merged |
| Deploy or deployment | Publish a version of the code to the live website |
| Cloudflare Worker | The Cloudflare service that runs this website |
| D1 database | The Cloudflare filing cabinet for accounts, articles, settings, and records |
| R2 bucket | The private Cloudflare storage area for uploaded documents and managed images |
| Migration | A planned change to the database structure |
| Secret or API key | A private value that proves the website may use a service |
| Password pepper | A private server value used as extra protection for password records |
| Backup | A separate protected copy used for recovery |
| Restore | Put data back from a backup or earlier point |
| Rollback | Return the website code to an earlier version |
| Logs | Technical records that help explain errors |
| News feed | A publisher-provided list of recent articles imported into the pipeline |
| AI provider | The outside company running a selected AI model |
| CI/CD | Automated checks and release steps for website code |
| Incident | A problem requiring a recorded response, such as an outage or data issue |

## Where to get technical help

Give the technical owner the detailed [PressReady website handover](WEBSITE_HANDOVER.md).
It contains the exact architecture, code locations, setup commands, deployment
steps, rollback process, database notes, verification results, and technical
limitations.

When asking for help, send this information without including secrets:

1. What you were trying to do.
2. The page address.
3. The exact visible error message.
4. The date and Hong Kong time.
5. Whether the problem affects one person or everyone.
6. Whether a deployment, setting, account, or database change happened first.
7. A screenshot with private information hidden.
8. The related incident or support-ticket number.
