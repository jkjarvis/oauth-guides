# OAuth Guides

Guides for setting up your own OAuth app with a provider and plugging it into Composio. Each guide gives the steps, hands-on time, approval wait, blockers, and who does what (you or an agent). It also tracks your progress in the browser.

**Live:** https://composio-fawn.vercel.app · **GitHub guide:** https://composio-fawn.vercel.app/github

This first slice covers **GitHub** end to end. Slack, Gmail, Microsoft Outlook and Meta are next.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run probe      # re-run live checks against GitHub and Composio
npm run build      # also validates every guide against the schema
```

No credentials or environment variables are needed.

## How it works

```
src/lib/guide-schema.ts      zod schema: the contract every guide follows
src/data/guides/github.json  the GitHub guide (data only, no layout)
scripts/probe-github.mjs     credential-free live checks → src/data/probes/github.json
src/app/[slug]/page.tsx      one template renders every guide
src/components/guide/        tracker, Client ID check, evidence labels
src/app/api/check/github     checks a Client ID against GitHub's sign-in page
```

- **Same layout, different content.** Guides are data. The schema caps text length (titles 60 chars, pointers 140), so guides stay scannable.
- **Evidence on every claim.** Each step, requirement, trap and blocker is labelled `tested`, `sourced` or `uncertain`. The schema rejects a claim marked `tested` without a probe, `sourced` without a source, or `uncertain` without a reason, so a bad guide fails the build.
- **Times stay honest.** Approval wait is stored in the provider's own unit (for example "3–5 business days") with the provider's wording. Hands-on time is a range in minutes.
- **Tracker without a server.** Step status (done, blocked, skipped) is saved in the browser's `localStorage`, keyed by step ID, so updating a guide keeps finished steps.

## Key decisions

| Decision | Why |
|---|---|
| Web first, not a CLI | The guide has to be shareable with people who won't install anything (PMs, security reviewers, DNS owners). |
| Steps and pointers, not prose | Developers scan. Each step lists who does it, how long it takes, values to copy, and a link to the right console page. |
| "Do you need your own app?" up front | Composio's managed app already works for GitHub. The guide says when switching is worth it. |
| No difficulty tier | Users don't filter by it. Hands-on time, approval wait, review and cost answer "how hard is it?" directly. |
| Client ID check | GitHub's sign-in page shows "continue to *app name*" only for a real Client ID. The app uses that to check yours, with no secret involved. |

## What was tested, sourced, and left uncertain (GitHub)

**Tested** (`npm run probe`, 10/10 passing on 2026-10-28):
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
- OAuth app restrictions are on by default for new GitHub orgs, so this is listed as a blocker on your users' side.

**Uncertain:**
- Whether Composio refreshes GitHub's 8-hour tokens correctly. Composio says it auto-refreshes OAuth tokens, but this wasn't tested end to end.
- A full connection through a real auth config. That needs a Composio API key and a real user sign-in, and wasn't run.
- What Composio's GitHub page shows after login. The link exists, but whether it opens auth config creation directly needs a logged-in check.

## Limitations

- Desktop only.
- Progress is stored per browser. It isn't shared across devices or teammates.
- One guide so far. Live generation for apps outside the library comes next.
