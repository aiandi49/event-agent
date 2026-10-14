# Event Agent

Event Agent helps people size up an event invitation, signup form or application before they hand over their details or money. Paste the invite or describe it, and the agent asks one question at a time, names the sales playbook behind the event, rates the pressure, and gives a concrete next step.

- **Agent (home page, `/`):** the interactive engine.
- **Guide (`/guide`):** nine sales playbooks, field notes on common tactics, and two real examples, all rendered from `data/gub.json`.

## 1. Put it on GitHub with GitHub Desktop

1. Unzip `event-agent.zip`. You get a folder named `event-agent` that is already a Git repository on the `main` branch with no commits yet.
2. Open GitHub Desktop and choose **File → Add local repository**. Select the `event-agent` folder and click **Add repository**.
3. In the Summary box, type `Initial commit` and click **Commit to main**.
4. Click **Publish repository**. Leave **Keep this code private** ticked, then click **Publish repository**.
5. On github.com, open the repository's **Settings**, then **Advanced Security** in the Security section of the sidebar. Click **Enable** next to **Secret Protection**, then **Enable** next to **Push protection**. For private repositories, GitHub may only offer these on paid plans; if they don't appear, the `.gitignore` here still keeps `.env` files out of commits.

## 2. Deploy on Vercel

1. In the [Claude Console](https://console.anthropic.com), create a workspace just for this project. Set a monthly spend limit and spend alerts on it, then create an API key inside that workspace.
2. In Vercel, click **Add New → Project**, import the private `event-agent` repository, and keep the default settings. There is no build step.
3. Before or after the first deploy, open **Project → Settings → Environment Variables** and add `ANTHROPIC_API_KEY` with your key, for the **Production** environment. Use a separate low-limit key for Preview, or none.
4. Optional: add `ANTHROPIC_MODEL` only if you want a model other than the default (`claude-sonnet-5-5`).
5. Redeploy so the function picks up the variables.
6. Open **Project → Firewall**, add the rate-limit rule described below, then **Review Changes** and **Publish**.

The chat cannot answer until the API key is set and the project has been redeployed.

## Rate limit

`api/chat.js` allows 20 requests per visitor per 10 minutes, as a best-effort limit inside each running server instance. Add the matching Vercel Firewall rule (path `/api/chat`, fixed window of 600 seconds, 20 requests, keyed by IP address, action Too Many Requests 429) for a limit that holds across all instances. Vercel lists WAF rate limiting as available on all plans, with a cap on how many custom rules Hobby projects can have.

## What works and what doesn't

Works now:

- A real conversation with one clarifying question at a time, then a verdict with the matching playbook, pressure level, what they'll collect, likely follow-up, and a next step.
- Live web searches (up to four per reply) to check a named organizer's prices, refund terms and complaints. Web search is billed by Anthropic per search on top of tokens.
- Ranked matches in the side cards, a link into the guide for each playbook, voice input, full-page chat, and a plain-text download of the check.
- Chat history kept in the browser tab only (sessionStorage). It clears when the tab closes.

Would need a bigger build:

- Accounts, saved history across devices, or sharing a check with someone else.
- Contacting organizers, unsubscribing on someone's behalf, sending email, or booking anything. The agent gives the exact words to use instead and never takes real-world actions.
- Reading uploaded screenshots or PDFs. Today it works from pasted or spoken text.

## Project layout

```
index.html            Engine (home page)
guide/index.html      Guide page, rendered from data/gub.json
data/gub.json         Guide content; the engine's function reads the same file
api/chat.js           Serverless function: security checks, guide retrieval, Anthropic call
assets/css/           engine.css (dark glass engine), guide.css (Caribbean editorial guide)
assets/js/            prefs.js (theme and text size), engine.js, guide.js
vercel.json           Security headers, function settings (includes data/**)
```

## Editing the guide

Edit `data/gub.json`. Each entry has `id`, `kind` (`playbook`, `field-note` or `case`), `title`, `summary`, `body`, `tags`, `details`, and optional `sources`. Playbook ids are the only ids the agent may return as matches, so keep them stable once published. If you add a playbook, update the "Nine patterns" sentence on the guide page.

The two real examples were checked on October 14, 2026. Prices, policies and dates change, so recheck them before relying on them.

## Security notes

- The Anthropic key lives only in Vercel environment variables and is read inside `api/chat.js`. Browser code only ever calls `/api/chat`.
- The function accepts POST only, requires JSON, rejects bodies over 32 KB, caps message count and length, forwards only user and assistant messages, and decides the model, token limit, tools and system prompt itself.
- Requests whose `Origin` isn't this site get a 403. This blocks other websites from using your function from a visitor's browser. It does not stop scripts, which can fake headers, so the rate limit and the workspace spend limit are what protect your budget.
- Errors return plain generic messages. Logs record status codes only.
- `vercel.json` sets a strict Content-Security-Policy (only this site plus Google Fonts), with the small theme-restore script allowed by its hash. If you edit that inline script in either HTML file, recompute its sha256 hash and update `vercel.json`, or the page will stop restoring the theme.
- If a key is ever exposed, in a file, a screenshot or a chat, revoke it in the Claude Console and create a new one. Deleting it from a file is not enough.

## Local development

There are no dependencies. Install the [Vercel CLI](https://vercel.com/docs/cli), copy `.env.example` to `.env.local`, add your key, and run `vercel dev` from this folder.
