# freeremovebg.com

## Project Overview

A web application at [freeremovebg.com](https://freeremovebg.com) that removes image backgrounds for free.

## Deployment Workflow

Two-tier deployment: **Staging** → **Production**.

### Branch Discipline
- Active development happens on `staging` (or feature branches off `staging`).
- `main` is production — never commit directly to it.
- A PreToolUse hook auto-switches from `main` to `staging` before any file edit.

---

## Skills

When the user asks to push to staging or promote to production, invoke the corresponding skill via the **Skill tool**:

### push-staging
**Invoke with:** `Skill({skill: "push-staging"})`

Triggers: "push to staging", "deploy to staging", "push staging", "/push-staging"

What it does:
1. Runs `pnpm build` to verify no errors.
2. Commits with a conventional commit message (`feat:`, `fix:`, `chore:`, etc.).
3. Pushes to `origin staging`.
4. Notifies the user so they can review on the staging URL.

### promote-production
**Invoke with:** `Skill({skill: "promote-production"})`

Triggers: ONLY the exact phrase **"Promote staging to production."**

What it does:
1. Verifies on `staging` with all changes committed/pushed.
2. `git checkout main && git pull origin main`
3. `git merge staging`
4. `git push origin main`
5. `git checkout staging`
6. Reports completion.

⚠️ Never touch `main` for any other reason. If merge conflicts occur, STOP and report them.

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
**Use when:** The user asks to test the UI, take screenshots, verify page behavior, or interact with the staging/production site.

All `mcp__playwright__*` tools are available — use them for browser-based testing and verification against the live site.

### Astro Docs
**Server:** `https://mcp.docs.astro.build/mcp` (HTTP)
**Purpose:** Look up Astro framework documentation directly via MCP.
**Use when:** The user asks about Astro APIs, configuration, routing, islands, or any Astro-specific feature.

---

## RTK (Rust Token Killer)

All Bash commands are automatically routed through RTK for token optimization. Use `rtk gain` to see savings. No special action needed — the hook handles it transparently.
