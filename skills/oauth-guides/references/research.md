# Researching a guide for a new provider

Write a guide, in the same format as the library, for a provider that isn't in it. A developer will follow it literally, so a wrong menu label, URL or wait time costs them hours. **Accuracy matters more than coverage.**

Use your web search and page-reading tools for docs. Use the script for live checks, because it decides pass or fail from the real response and records the result. Paths are relative to the skill directory.

## Method

1. **Composio toolkit.** Run `node scripts/oauth.mjs toolkit <slug> <toolkit>`.
   - `<slug>` is the guide's id, e.g. `pipedrive`.
   - `<toolkit>` is Composio's slug, e.g. `pipedrive`, `zoho_crm` or `googlecalendar`.
   - The command reports whether the toolkit exists and whether Composio offers a managed app (that's `composio.managedAvailable`). It also records the `composio-*` checks you can cite.
   - If the toolkit isn't found, try one or two other slugs. If none exist, say so in the tagline and keep the Composio steps generic.
2. **Official docs.** Read the provider's own developer docs, not blogs:
   - app or client registration;
   - OAuth authorization: endpoints, redirect URI rules, PKCE, refresh tokens;
   - scopes;
   - any review, verification, marketplace or production-approval process.

   Read Composio's setup page for the provider if one exists, but trust the provider's docs when they disagree.
3. **Blockers.** Look specifically for what blocks or delays developers. Check the provider's developer support and FAQ pages too, because review timelines are often stated there. Look for:
   - mandatory reviews and their stated timelines;
   - user or install caps before approval;
   - admin consent in the end user's organization;
   - business or domain verification;
   - security assessments;
   - paid tiers;
   - short token lifetimes;
   - scope restrictions;
   - recent (2025–2026) policy changes;
   - statements that conflict between pages.
4. **Live checks.** These are credential-free and recorded by the script. Set the expectation so the check passes when reality matches what the guide claims.

   ```bash
   # the authorize URL with a fake client_id and Composio's callback: record the exact error or sign-in redirect
   node scripts/oauth.mjs probe <slug> --id authorize-endpoint --title "Authorize endpoint rejects unknown client" \
     --url "https://provider.com/oauth/authorize?client_id=fake&redirect_uri=https%3A%2F%2Fbackend.composio.dev%2Fapi%2Fv3%2Ftoolkits%2Fauth%2Fcallback&response_type=code" \
     --contains "invalid_client"
   # the token endpoint with fake credentials (POST form)
   node scripts/oauth.mjs probe <slug> --id token-endpoint --title "Token endpoint answers invalid_client" \
     --url https://provider.com/oauth/token --post grant_type=authorization_code --post code=x --post client_id=fake --post client_secret=fake --status 400,401
   ```

   - **Flags:** `--status 200,302`, `--contains <text>` (repeatable), `--lacks <text>`, `--location <text>` (with `--no-follow`), `--final <text>` (the URL after redirects).
   - **Also worth checking:** the OIDC discovery document (`/.well-known/openid-configuration`), the developer console URL, and the provider's support or contact page.
   - **A check that fails is a finding.** Change the guide; don't cite the failed check.
   - Keep it to about six checks.
5. **Write** `.oauth-guides/guides/<slug>.json`, then run `node scripts/oauth.mjs validate <slug>`. Fix every error it lists and run it again. Once it passes, the guide shows up in `list` and `status` like any library guide.

## Accuracy rules

- **Sources:** only cite pages you actually read in this session. You may also cite the pre-verified Composio pages below. Never invent URLs, menu paths, email addresses, scopes or timelines.
- **Labels:** use the console's exact labels as the docs show them. If the docs don't show the current label, describe the action plainly and put what you couldn't confirm in the step's `unconfirmed` note.
- **Waits:**
  - Quote the provider's own wording in `wait.asStated` ("3–5 business days", "within a week", "no published timeline").
  - Never convert it to a number the provider didn't state.
  - If no timeline is published, say so and set `openEnded: true`.
- **Conflicts:** when two official sources disagree, add a warning that states both.
- **Unconfirmed notes:** anything you inferred but couldn't verify goes in an `unconfirmed` note on that step or warning. Several are fine, and expected.
- **Secrets:** checks use public IDs only, never a client secret.

Pre-verified Composio sources (cite by adding them to `sources`):

```json
[
  { "id": "composio-quickstart", "title": "Composio · Quickstart", "url": "https://docs.composio.dev/docs/quickstart" },
  { "id": "composio-dashboard-nav", "title": "Composio · Dashboard auth configs", "url": "https://docs.composio.dev/kb/guide/dashboard-auth-configs-navigation" },
  { "id": "composio-managed-vs-custom", "title": "Composio · Managed vs custom auth", "url": "https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app" },
  { "id": "composio-custom-auth", "title": "Composio · Custom auth configs", "url": "https://docs.composio.dev/docs/auth-configuration/custom-auth-configs" },
  { "id": "composio-white-label", "title": "Composio · White-labeling", "url": "https://docs.composio.dev/docs/authentication/white-labeling-authentication" }
]
```

## Guide shape

The exact contract is [guide.schema.json](guide.schema.json). A complete, checked example is `data/guides/github.json`, and you can copy its Composio steps.

**Steps,** in the order a developer does them:
1. Set up your Composio account (copy the GitHub guide's step and adapt the toolkit).
2. Create the app.
3. Configure the redirect URI and scopes. The redirect URI is Composio's callback, `https://backend.composio.dev/api/v3/toolkits/auth/callback`.
4. Get the credentials.
5. Create the Composio auth config. Its action link is `https://dashboard.composio.dev/toolkits/<toolkit>`.
6. Use the auth config in the agent (copy the GitHub snippets and adapt the toolkit key).
7. Connect a test account.
8. Any distribution, verification, review and approval steps, and any steps in the end user's organization.

**`who`** says who acts in each step:
- `you`: hands-on work.
- `agent`: drafting text or pasting code, which an agent can do.
- `wait`: the provider's review clock. It needs a `wait` with `asStated` and a `summary` of 24 characters or fewer.
- `their-admin`: someone in the end user's organization.

Use `optional` together with `when` for conditional steps.

**`agentTask`** goes on a `you` step that has a part a coding agent can do, such as editing a config file, running a CLI, or writing a redirect route. It's one sentence of at most 160 characters. Leave it out when the step is all console clicks.

**Instructions** are short imperatives: at most 160 characters each and 8 per step. Put copy-ready values in `fields`, and keep prose out.

**Evidence:**
- Each step needs `sources`, passing `checks`, or an `unconfirmed` note.
- Each warning needs `sources` or `unconfirmed`.

**`problems`** go on each step. They're your own plain explanation of real errors people hit (with the exact error text when it's documented) and how to fix them. They're shown before any contact option.

**`contacts`:**
- The provider's real developer support routes, each backed by a source or a passing check.
- Plus `composio-discord`, copied from the GitHub guide.
- Steps about Composio use `contacts: ["composio-discord"]`.

**`facts`:**
- `handsOnMinutes`: a realistic range for the developer's own work.
- `approvalWait`: `null` when no review blocks production use; otherwise it needs a `summary`.
- `review`: `none`, `optional` or `required`.
- `cost`: `asStated` plus a `summary` of 24 characters or fewer.

**Other fields:**
- `tagline`: one sentence (160 characters max) saying what's involved and what the main hurdle is.
- `version`: `1`.
- `lastVerified`: today's date.
- `composio.callbackUrl`: Composio's callback above.

When it validates, show the user the board, and say plainly that the guide was researched by an agent and not reviewed by a person.
