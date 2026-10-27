# OAuth Guides

Guides for setting up your own OAuth app with a provider and plugging it into Composio. Each guide gives the steps, hands-on time and approval wait, and shows who does each step (you or an agent). It also tracks your progress in the browser.

**Live:** https://composio-fawn.vercel.app

Guides: [GitHub](https://composio-fawn.vercel.app/github) · [Slack](https://composio-fawn.vercel.app/slack) · [Gmail](https://composio-fawn.vercel.app/gmail) · [Microsoft Outlook](https://composio-fawn.vercel.app/outlook) · [Meta](https://composio-fawn.vercel.app/meta)

They were picked to cover different setup shapes: instant (GitHub), soft limits plus an optional marketplace review (Slack), scope-driven verification with a security audit (Gmail), a blocker in your user's organization (Outlook admin consent), and business verification plus per-permission review (Meta).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run probe      # re-run credential-free live checks for every guide (or: npm run probe -- slack)
npm run validate   # schema + every cited live check exists and passed
npm run build      # also fails on an invalid guide
```

No credentials or environment variables are needed.

## How it works

```
src/lib/guide-schema.ts      zod schema: the contract every guide follows
src/data/guides/<slug>.json  one guide per provider (data only, no layout)
scripts/probes/<slug>.mjs    credential-free live checks → src/data/probes/<slug>.json
scripts/validate.mts         schema + live-check validation
src/app/[slug]/page.tsx      one template renders every guide
src/components/guide/        step nav + step view, help panel, Client ID check
src/app/api/check/github     checks a Client ID against GitHub's sign-in page
```

- **Same layout, different content.** Guides are data. The schema caps text length (titles 60 chars, instructions 160), so guides stay scannable.
- **Everything lives in the steps.** Step titles sit in a left nav. The main view shows one step: numbered instructions, values to copy, console links, and warnings. There is no sidebar, so long provider steps get the full width.
- **Every step shows where it comes from.** Each step ends with the docs it's based on, any live checks we ran, and a "Not confirmed" note where we couldn't verify something. The schema fails the build if a step or warning has no source, no live check, and no note.
- **Step types.** Each step says who acts: **You** (hands-on), **Agent** (this site or your coding agent can do it), **Wait** (the provider's clock, with the provider's own wording, e.g. "3–5 business days"), or **Their admin** (someone in your user's organization, e.g. Microsoft admin consent). Optional steps say when they apply.
- **Help, explained first.** Each step has a "Stuck on this step?" panel. It starts with our explanation of the problems people actually hit, with the fix. Only below that does "Still stuck? Ask …" route you to the provider's support (email or help page) or Composio's Discord, with a ready-to-send message that has the details filled in.
- **Times stay honest.** Approval wait is stored in the provider's own unit (for example "3–5 business days") with the provider's wording. Hands-on time is a range in minutes.
- **Tracker without a server.** Step status (done, blocked, skipped) is saved in the browser's `localStorage`, keyed by step ID, so updating a guide keeps finished steps.

## Key decisions

| Decision | Why |
|---|---|
| Web first, not a CLI | The guide has to be shareable with people who won't install anything (PMs, security reviewers, DNS owners). |
| Steps and pointers, not prose | Developers scan. Each step lists who does it, how long it takes, values to copy, and a link to the right console page. |
| No sidebars or metric panels | Prerequisites, blockers and gotchas go in the step where they matter, not in a separate list people skip. |
| No difficulty tier | Users don't filter by it. Hands-on time, approval wait, review and cost answer "how hard is it?" directly. |
| Client ID check | GitHub's sign-in page shows "continue to *app name*" only for a real Client ID. The app uses that to check yours, with no secret involved. |

## How the guides were researched

One research agent per provider (Slack, Gmail, Outlook, Meta) worked from the same brief. Each agent:
- read the official docs and wrote the guide against the schema;
- wrote credential-free probes and ran them;
- iterated until `npm run validate` passed;
- reported what it corrected and what it couldn't verify.

GitHub was done by hand first and served as the reference.

**Live checks:** 87 probes across the five guides, all passing on 2026-10-28 (GitHub 12, Slack 17, Gmail 24, Outlook 14, Meta 20). Each step shows the checks that back it under "Checked live".

**Independent spot-checks** (re-read from the original source, not the agent's notes):
- Gmail: `gmail.compose` is a restricted scope.
- Slack: Marketplace now needs 10 active installs, held for the whole review.
- Outlook: Microsoft's managed consent policy excludes `Mail.Read` and `Calendars.*` from user consent.
- Meta: Graph API v26.0 is current.

All four held.

**Notable corrections the agents found:**
- **Slack:** the Marketplace install bar went back up to 10 (July 2026). Rate limits for non-Marketplace apps don't apply to existing installs, but the API reference still lists the old tier. Both are flagged in the guide.
- **Gmail:**
  - `gmail.compose` is restricted, not sensitive.
  - Brand verification is usually automated (minutes). Google's FAQ estimates longer reviews (10 business days / 6 weeks) than its guides do (3–5 days / several weeks), so the guide shows both.
  - Google requires a verified redirect domain, so routing the callback through your own domain is an optional step.
  - Composio's own Google page still shows the old callback.
- **Outlook:**
  - Microsoft's default consent policy makes admin consent the normal case for work tenants, even for verified publishers.
  - The Entra Q&A tag Microsoft links to is now unmonitored, so the guide uses the active one.
- **Meta:**
  - The redirect URI belongs in Facebook Login for Business → Settings, not App Settings → Advanced (as a Composio blog says).
  - The Graph API is at v26.0.
- **Everywhere:** only GitHub reveals whether a Client ID is valid before sign-in, so only GitHub gets the live Client ID check.

**What stays unconfirmed everywhere:**
- A full end-to-end connection through a real Composio auth config. It needs real accounts and wasn't run.
- What Composio's dashboard deep links open after login.

Both are marked "Not confirmed" on the relevant steps.

## What was tested, sourced, and left uncertain (GitHub)

**Tested** (`npm run probe -- github`, 12/12 passing on 2026-10-28):
- A valid Client ID shows the app name on GitHub's sign-in page. An unknown one doesn't.
- The token endpoint returns `incorrect_client_credentials` for a wrong secret, and `Not Found` for an unknown Client ID.
- Composio's callback URL (`/api/v3/toolkits/auth/callback`) is live.
- GitHub's registration page exists and requires sign-in.
- Composio's dashboard deep links exist: `/toolkits/github` and `/~/project/settings/api-keys` redirect to login and keep the path, while unknown paths return 404. The login page links to sign-up.
- GitHub serves no OIDC discovery document, so this is plain OAuth 2.0.

**Sourced:** GitHub docs (registration, authorization, scopes, org restrictions, transfer) and Composio docs (managed vs custom auth, custom auth configs, white-labeling).

**Corrected during research:**
- Older Composio pages show the callback as `/api/v1/auth-apps/add` or `/api/v3.1/...`. The guide uses `/api/v3/...`, which current docs list and the probe confirms. It also tells you to match whatever your auth config shows.
- GitHub now turns on "Expire user access tokens" by default (8-hour tokens with refresh). Older guides assume tokens never expire.
- OAuth app restrictions are on by default for new GitHub orgs, so the guide has an optional "Get org approval" step for your users' orgs.

**Uncertain:**
- Whether Composio refreshes GitHub's 8-hour tokens correctly. Composio says it auto-refreshes OAuth tokens, but this wasn't tested end to end.
- A full connection through a real auth config. That needs a Composio API key and a real user sign-in, and wasn't run.
- What Composio's GitHub page shows after login. The link exists, but whether it opens auth config creation directly needs a logged-in check.

## Limitations

- Progress is stored per browser. It isn't shared across devices or teammates.
- Five guides so far. Live generation for apps outside the library comes next.
- Help contacts were verified to exist; we didn't test response times.
