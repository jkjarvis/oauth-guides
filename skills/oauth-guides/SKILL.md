---
name: oauth-guides
description: Walks a developer through setting up their own OAuth app with a provider (GitHub, Slack, Gmail, Outlook, Meta, Notion, Linear, Jira, Dropbox, HubSpot, Zoom, or any other app) and plugging it into Composio as a custom auth config, one step at a time, with progress saved in the project. Use when the user wants to register an OAuth app, bring their own client ID/secret, get an app reviewed, verified or approved, replace Composio's managed app, resume OAuth setup, or get a guide for a provider that isn't in the library.
---

# OAuth Guides

Step-by-step guides for registering an OAuth app with a provider, getting it approved, and using it in Composio. The same guides as https://composio-fawn.vercel.app, with progress tracked in the project.

Everything goes through one script. Paths below are relative to this file's directory:

```bash
node scripts/oauth.mjs <command>
```

Progress and any researched guides are saved in `.oauth-guides/` in the current project (it ignores itself in git).

## Show the output as it is

The script's output is the interface: progress bars, step lists and step details are laid out for a terminal. After each command, show its output to the user **verbatim in a ```text block**, then add at most two lines of your own (what you did, or what you need from them). Don't restate the step in your own words.

## Flow

1. **Find where they are.** Run `status`. If a guide is in progress, continue it. Otherwise run `list` (or `list <query>`) and pick the guide for their provider.
2. **Not in the library?** Offer two options:
   - research it here: follow [references/research.md](references/research.md);
   - or generate it on the web (`https://composio-fawn.vercel.app/new?app=<name>`, about 3 minutes) and paste the share link: `import "<link>"`.
3. **Show the board, then one step at a time.** `status <slug>`, then `step <slug>` (it picks the next open step). Show it.
4. **Do what you can, hand off the rest.** Each step says who acts:
   - **You** (the developer): they click through a console. Give them the links from the step and wait for them to say it's done.
   - **Your agent can do this**: you do it. Adapt the step's code into their project (find where they create the Composio session; don't paste blindly), then tell them what changed.
   - **Provider's clock** (wait): when they've submitted, run `waiting <slug> <step>` and move on to steps that don't depend on approval. `status` shows how long they've waited against what the provider promised.
   - **Your user's admin**: someone in the end user's organization must act. Help them draft the request to that admin.
   - A step that shows **◆ Agent can do:** has a part you handle (edit a config file, run a CLI, write a route, draft a note). Offer to do that part; the developer does the rest.
5. **Record progress only when it's true.** Run `done` after the user confirms a hands-on step, or after you've verified your own work. For a GitHub Client ID, run `check-github-client-id <id>` and mark the step done if it passes. `skip` is for optional steps that don't apply. `block <slug> <step> "<reason>"` when they're stuck on something outside their control.
6. **Stuck?** Run `help <slug> <step>`: known problems with fixes first, then the provider's support route and a ready-to-send message. Work through the known fixes before suggesting they contact anyone.

## Rules

- Never ask the user to paste a client secret into the chat, and never write secrets into `.oauth-guides/`. Secrets go into the provider console, the Composio dashboard, or their own env file, which they fill in themselves. Client IDs and auth config IDs (`ac_…`) are fine to handle.
- The guides cite sources and live checks for each step. If the user sees something different in the console (renamed button, new requirement), believe the console, tell the user the guide differs, and continue.
- Keep to one step at a time. Don't dump the whole guide.
- Waits are quoted in the provider's own words. Don't promise faster approval than the guide states.

## Commands

| Command | What it does |
|---|---|
| `list [query]` | Library and local guides, with hands-on time, approval wait and progress |
| `status [slug]` | Progress board; with no slug, every guide started in this project |
| `step <slug> [step-id\|next] [--lang python]` | One step: instructions, values to copy, code, links, warnings, sources |
| `help <slug> <step-id>` | Known problems and fixes, who to ask, a message to send |
| `done`, `skip`, `todo` `<slug> <step-id>` | Update a step (`todo` reopens it) |
| `block <slug> <step-id> "<reason>"` | Mark a step blocked |
| `waiting <slug> <step-id>` | A wait step's clock has started |
| `check-github-client-id <id>` | Checks that GitHub recognises a Client ID (public; never the secret) |
| `import <share-link\|file.json>` | Save a guide generated on the web |
| `toolkit`, `probe`, `validate` | Research tools; see [references/research.md](references/research.md) |
