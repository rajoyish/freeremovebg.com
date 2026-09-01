# freeremovebg.com

## Project Overview

A web application at [freeremovebg.com](https://freeremovebg.com) that removes image backgrounds for free.

## Deployment Workflow

Single-tier deployment: pushing to `main` deploys to production ([freeremovebg.com](https://freeremovebg.com)) via the GitHub Actions workflow in `.github/workflows/deploy.yml`.

### Branch Discipline
- Active development happens on `main` or on feature branches merged into `main`.
- Every push to `main` triggers a production deploy to Cloudflare Workers.

### Feature / Refactor Workflow

Each feature or refactor flows through a short-lived branch and a squash-merged PR. There is no staging buffer — **merging a PR deploys to production.**

1. **Start clean on `main`:**
   ```bash
   git checkout main
   git pull origin main
   ```
2. **Make the change.** No need to branch first — the `ship-it` skill creates the branch.
3. **Ship it:** say "ship it" (or `/ship`). The skill creates a contextual `feat/…` or `refactor/…` branch, stages everything, commits with a conventional message, pushes, and opens a PR against `main`.
4. **Review & merge on GitHub** using **Squash and merge**. The PR title (`type(scope): subject`) becomes the squashed commit on `main`. GitHub auto-deletes the head branch, and the push to `main` fires the production deploy.
5. **Resync locally:**
   ```bash
   git checkout main
   git pull origin main
   ```

GitHub repo settings backing this flow: **Allow squash merging** (only) and **Automatically delete head branches** are enabled.

Guidelines:
- `ship-it` runs `git add .` — ensure the working tree holds only intended changes before shipping.
- Keep PRs small and focused: one feature/refactor per branch → one squashed commit → one deploy.
- Review the diff *before* merging, since merge = go-live.

---

## Skills

### ship-it
**Invoke with:** `Skill({skill: "ship-it"})`

Triggers: "ship it", "commit and pr", "deploy this", "/ship".

Commits staged changes on a feature branch, pushes, and opens (or reports) a squash-merge PR against `main`. Uses conventional-commit messages and omits any `Co-Authored-By` trailer. See the Feature / Refactor Workflow above.

### translate-locale
**Invoke with:** `Skill({skill: "translate-locale"})`

Triggers: "translate the site", "translate locales", "continue translating", "translate <language>", `/translate`.

Translates `src/i18n/locales/*.json` one language at a time in capped batches, so a single session never tries to cover all 49. Claude writes the translations directly; there is no translation API in this project and none should be added (`LOCALIZATION.md` §1). Each run extracts a batch, merges it through a validator that rejects bad keys and drifted HTML, and reports what got finished this session against what remains.

```bash
pnpm i18n:status                          # coverage table, session count, queue
node scripts/i18n/extract.mjs es --max 40 # write a fill-in batch
node scripts/i18n/merge.mjs es            # validate and merge it
```

### tailwind-4-docs
**Invoke with:** `Skill({skill: "tailwind-4-docs"})`

Triggers: Tailwind CSS v4 questions, utility/variant selection, configuration, v3→v4 migration, Tailwind implementation/refactor/review tasks.

**Requires initialization.** On first use, run:
```
python .claude/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py --accept-docs-license
```
If the snapshot is >1 week old, refresh it. Use `.claude/skills/tailwind-4-docs/references/gotchas.md` as a fallback when the snapshot is unavailable.

References live at `.claude/skills/tailwind-4-docs/references/` — engineering-playbook.md for implementation, gotchas.md for quick v4 migration pitfalls.

### web-design-guidelines
**Invoke with:** `Skill({skill: "web-design-guidelines"})`

Triggers: "review my UI", "check accessibility", "audit design", "review UX", "check my site against best practices".

What it does: Fetches the latest Web Interface Guidelines from Vercel Labs, reads the specified files, and outputs compliance findings.

---

## MCP Servers

This project uses the following MCP servers:

### Playwright
**Server:** `@playwright/mcp@latest`
**Purpose:** Browser automation for testing, screenshots, and UI verification.
**Use when:** The user asks to test the UI, take screenshots, verify page behavior, or interact with the production site.

All `mcp__playwright__*` tools are available — use them for browser-based testing and verification against the live site.

### Astro Docs
**Server:** `https://mcp.docs.astro.build/mcp` (HTTP)
**Purpose:** Look up Astro framework documentation directly via MCP.
**Use when:** The user asks about Astro APIs, configuration, routing, islands, or any Astro-specific feature.

---

## RTK (Rust Token Killer)

All Bash commands are automatically routed through RTK for token optimization. Use `rtk gain` to see savings. No special action needed — the hook handles it transparently.
