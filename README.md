# OAuth Guides

Guides for setting up **your own OAuth app** with a provider and plugging it into Composio, instead of Composio's managed app. Each guide covers:
- the steps, and who does each one;
- hands-on time and approval wait;
- the blockers;
- where every claim comes from.

It tracks your progress in the browser. For apps outside the library, an agent researches the provider live and writes a guide in the same format.

**Live:** https://composio-fawn.vercel.app · **Generate a guide:** https://composio-fawn.vercel.app/new

**Use it in your coding agent:** click **Use in your agent** on the home page, or:

```bash
# Claude Code
mkdir -p ~/.claude/skills && curl -fsSL https://composio-fawn.vercel.app/skills/oauth-guides.tar.gz | tar -xz -C ~/.claude/skills
# Codex
mkdir -p ~/.agents/skills && curl -fsSL https://composio-fawn.vercel.app/skills/oauth-guides.tar.gz | tar -xz -C ~/.agents/skills
```

Then ask "Set up my own Slack OAuth app for Composio".

**Library (11):** [GitHub](https://composio-fawn.vercel.app/github) · [Slack](https://composio-fawn.vercel.app/slack) · [Gmail](https://composio-fawn.vercel.app/gmail) · [Microsoft Outlook](https://composio-fawn.vercel.app/outlook) · [Meta](https://composio-fawn.vercel.app/meta) · [Notion](https://composio-fawn.vercel.app/notion) · [Linear](https://composio-fawn.vercel.app/linear) · [Jira](https://composio-fawn.vercel.app/jira) · [Dropbox](https://composio-fawn.vercel.app/dropbox) · [HubSpot](https://composio-fawn.vercel.app/hubspot) · [Zoom](https://composio-fawn.vercel.app/zoom)

They were picked to cover different setup shapes:
- **Instant:** GitHub, Linear.
- **Install or user caps until approval:** HubSpot (25 installs), Dropbox (50 users, then a 2-week deadline).
- **Optional marketplace review:** Slack, Notion, Jira.
- **Scope-driven verification and a security audit:** Gmail (CASA).
- **A blocker in your user's organization:** Outlook admin consent, Jira site admins.
- **Business verification plus per-permission review:** Meta.
- **A two-stage publish review with security docs:** Zoom.

## Run it

```bash
npm install
npm run dev                       # http://localhost:3000
npm run probe                     # re-run credential-free live checks (or: npm run probe -- slack)
npm run validate                  # schema + every cited live check exists and passed
npm run build                     # also fails on an invalid guide
npm run research -- "Pipedrive"   # run the research agent from the terminal (needs ANTHROPIC_API_KEY in .env.local)
npm run skill                     # bundle guides into skills/oauth-guides and public/skills/oauth-guides.tar.gz (runs before dev and build)
```

The library needs no credentials. The research agent needs `ANTHROPIC_API_KEY` (set in Vercel for production).

## How it works

```
src/lib/guide-schema.ts        zod schema: the contract every guide follows (library and generated)
src/data/guides/<slug>.json    one guide per provider (data only, no layout)
scripts/probes/<slug>.mjs      credential-free live checks → src/data/probes/<slug>.json
scripts/validate.mts           schema + live-check validation
src/components/guide/          step nav + step view, help panel, Client ID check (one template for every guide)
src/lib/research/              research agent: prompt, tools, probes, validation loop
src/app/api/research           streams research progress (NDJSON)
src/app/new · src/app/g        generate a guide · open a shared generated guide
skills/oauth-guides/           the agent skill: SKILL.md, scripts/oauth.mjs, research reference, bundled guide data
scripts/build-skill.mts        syncs guides + JSON schema into the skill and builds the install tarball
```

**The guide experience**
- **Same layout, different content.** Guides are data. The schema caps text length (titles 60 characters, instructions 160), so guides stay scannable.
- **Everything lives in the steps.** Step titles sit in a left nav. The main view shows one step: numbered instructions, values to copy, console links and warnings. There are no sidebars or metric panels; prerequisites, blockers and gotchas go in the step where they matter.
- **Step types.** Each step says who acts:
  - **You:** hands-on work.
  - **Agent:** this site or your coding agent can do it.
  - **Wait:** the provider's clock, quoted in the provider's own words.
  - **Their admin:** someone in your user's organization, e.g. Microsoft admin consent.

  Optional steps say when they apply.
- **Every step shows where it comes from.** Each step ends with "Checked live" (probes that passed), "Not confirmed" (what we couldn't verify) and "Sources". The build fails if a step or warning has none of these.
- **Help, explained first.** "Stuck on this step?" starts with our explanation of the errors people actually hit, with the fix. Below that, "Still stuck? Ask …" routes you to the provider's support (email or help page) or Composio's Discord, with a ready-to-send message.
- **Tracker without a server.** Step status (done, blocked, skipped) is saved in `localStorage`, keyed by step ID, so guide updates keep finished steps.

**The research agent** (`/new`)
- **What it runs on:** the Claude API (`claude-opus-5-5`, adaptive thinking, high effort) with Anthropic's server-side `web_search` and `web_fetch` tools, plus three tools of ours:
  - `composio_toolkit`: reads Composio's public toolkit page to see whether the toolkit exists and whether a managed app is available;
  - `http_probe`: credential-free HTTP checks. Only public https hosts are allowed (private IPs are blocked), and **the server decides pass or fail**, not the model;
  - `submit_guide`: the server validates the guide before accepting it.
- **What validation rejects:** a guide that fails the schema, cites a check that failed or never ran, or cites a source that wasn't fetched in that run. The agent gets the errors back and fixes them. Fields the server owns (date, callback URL, Composio contact) are set by the server.
- **The method is fixed in the prompt:**
  1. Composio toolkit lookup (done before the model starts);
  2. official docs only;
  3. look for blockers (reviews, caps, admin consent, verification, costs, token lifetimes, recent changes, conflicting docs);
  4. live probes;
  5. submit.

  Waits must quote the provider's wording, and anything inferred goes in "Not confirmed".
- **Budgets keep a run under Vercel's 300-second limit:** 6 searches and 12 page fetches per run, and a hard switch to submit-only after 150 seconds.
- **Measured:** Xero 271s (before the budgets), Pipedrive 257s (before whole-run budgets), Dropbox 155s, Linear 183s, Zoho CRM 169s, Calendly 120s at about $0.96 (token usage is logged per run).
- **Sharing needs no storage.** The finished guide is compressed into the link's `#fragment` (about 7 KB for a 9-step guide) and the address bar switches to it, so a refresh, bookmark or copied link keeps the guide. The schema allows only https links, because a shared link carries untrusted data.
- **Limits:** a best-effort cap on concurrent runs and runs per IP, since each run costs money.

**The agent skill** (`skills/oauth-guides`)
- **Same guides, in the terminal.** One skill holds every library guide. The agent shows the board and one step at a time, does the `agent` steps itself (adapting the snippet into the project), and waits for the developer to confirm their own steps.
- **One bundled script, no CLI to install.** `scripts/oauth.mjs` (Node 18+, no dependencies) renders the board, steps and help, and records progress. The agent runs it and shows its output verbatim, so every agent shows the same UI.
- **Progress is saved in the project.** It lives in `.oauth-guides/progress.json`, keyed by step ID. Statuses are done, skipped, blocked (with a reason) and waiting (a review clock started, shown against the provider's stated wait). The folder git-ignores itself.
- **New providers.** The agent researches them with its own web tools, following `references/research.md` (the same method and rules as the web agent). The script runs the live checks and decides pass or fail. `validate` applies the site's schema (generated from zod) and its cross-checks, and the guide must only cite checks that passed. Guides generated on the web can be imported from their share link (`import <link>`).
- **Installed with one command per agent:**
  - Claude Code loads skills from `~/.claude/skills`; Codex from `~/.agents/skills`.
  - The tarball is rebuilt from `src/data` on every deploy.
  - Since the repo is private, there's no plugin or `npx skills` install.
- **Tested:**
  - All 142 steps render through `step` and `help`, and all 11 guides pass the skill's validator, matching the site.
  - Claude Code ran headless with the installed skill. It picked the skill from a plain request, showed the board and step verbatim, recorded progress across turns, and asked only for the public Client ID.
  - A second headless run researched Calendly from scratch through the skill. The result was an 8-step guide with 11 sources and 11 passing checks, and it passed `validate`. Two checks that failed (OAuth metadata documents) were recorded and left uncited. The agent flagged where Composio's scope list and Calendly's disagree.

## Key decisions

| Decision | Why |
|---|---|
| Web first, not a CLI | The guide has to be shareable with people who won't install anything (PMs, security reviewers, DNS owners). |
| Steps and pointers, not prose | Developers scan. Each step lists who does it, how long it takes, values to copy, and a link to the right console page. |
| No sidebars, tiers or metric panels | Users don't filter by difficulty. Hands-on time, approval wait, review and cost answer "how hard is it?" directly. |
| Generated guides use the library's schema and UI | One format to learn, and the same validation applies to agent output as to the library. |
| Claude API directly, not an agent framework | Server-side search and fetch plus three small tools are enough; one route streams progress and fits in a Vercel function. |
| Server decides probe results and checks citations | The model can't mark its own checks as passing or cite pages it didn't read. |
| Share via URL fragment | Shareable links without a database, and the fragment never reaches a server. |
| Skill + bundled script, not a CLI | Developers already work in Claude Code or Codex. A skill needs no install beyond extracting a folder, and the script keeps the output and progress the same across agents. |
| Skill progress in the project folder | Codex's sandbox only writes inside the workspace, and the progress belongs to the project being set up. It's git-ignored by default. |

## How the guides were researched and checked

1. **Writing.** GitHub was written by hand as the reference. Each of the other ten was written by a research agent working from the same brief: read official docs, write the guide against the schema, write probes, and iterate until `npm run validate` passed.
2. **Live checks.** 184 probes across 11 guides, all passing on 2026-10-28. Steps show the checks that back them.
3. **Independent fact-check.** Two fresh agents re-checked every guide's steps, URLs, waits, caps and error texts against current provider docs, and fixed what was wrong:
   - **Gmail:** CASA's Tier 2 self-scan is deprecated; you now go through an authorized lab.
   - **Outlook:** the cause given for a publisher-verification error was wrong.
   - **Slack:** admin menu labels and the "resubmission resets the queue" claim were out of date.
   - **Meta:** added a missing 60-day token / 90-day data-access warning.
   - **Notion:** corrected the steps for sharing a page with a connection.
   - **GitHub:** the check-runs wording is now precise.
   - **HubSpot:** two small corrections.
   - Linear, Jira, Dropbox and Zoom were confirmed as written.
4. **My own spot-checks** against original sources all held:
   - `gmail.compose` is restricted.
   - Slack needs 10 active installs.
   - Microsoft's default policy blocks user consent to `Mail.Read`.
   - Meta Graph is at v26.0.
5. **Agent vs curated (prompt eval).** The research agent generated Linear and Dropbox from scratch, and I compared the results with the curated guides:
   - **Matched:** steps, step types, and key details (Linear's 24-hour tokens since April 2026; Dropbox's 50 / 2-week / 500 rule).
   - **Curated guide was wrong:** the agent found Dropbox's "We respond to nearly all production requests within a few business days", which the curated guide had missed. That's now fixed.
   - **Prompt changes:** check support and FAQ pages for timelines; the tagline length limit.
6. **Live QA.**
   - **Guides:** clicked through all 142 steps of all 11 guides at desktop and phone width. No errors and no sideways scrolling.
   - **Links:** checked 262 links. The only non-200 responses came from sites that block scripts; Meta's pages load in a real browser.
   - **Generator:** ran the full flow live (search → generate → share link → open the shared guide).

**Notable things the research surfaced:**
- Several Composio setup pages still show the old `/api/v1/auth-apps/add` callback or outdated menus (Google, Linear, Jira, Dropbox, HubSpot). The guides say to set the v3 callback in both places.
- Google, Zoom and others require a redirect domain you've verified, which `composio.dev` isn't. That's why there's an optional "route the callback through your domain" step.
- Microsoft's default consent policy makes admin consent the normal case for work tenants.
- HubSpot stopped new legacy public apps on 2026-06-23; projects (`hs project create`) are the only path.
- Only GitHub reveals whether a Client ID is valid before sign-in, so only GitHub gets the live Client ID check.

## What stays unconfirmed

- A full end-to-end connection through a real Composio auth config. It needs real provider accounts and a Composio API key, and wasn't run for any guide. It's marked on each "Connect a test account" step.
- What Composio's dashboard deep links open after login. The routes exist (they redirect to login and keep the path, while unknown paths return 404).
- Response times of support contacts. We checked that they exist.
- Generated guides are researched live and **not reviewed by a person**. The page says so, and each step carries its own sources and "Not confirmed" notes.

## Limitations

- Progress on the site is stored per browser, and skill progress per project folder. The two don't sync.
- The skill was tested in Claude Code. Codex wasn't installed here, so the Codex path (`~/.agents/skills`, from OpenAI's docs) is untested.
- The research agent must finish within Vercel's 300-second function limit. Very large providers may get a thinner guide with more "Not confirmed" notes.
- Rate limiting is per instance and best-effort.
