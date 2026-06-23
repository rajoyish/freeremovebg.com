# Promote Staging to Production

Merge the `staging` branch into `main` and push to production.

## Trigger

This skill is ONLY invoked when the user says the exact phrase: **"Promote staging to production."**

## Workflow

1. **Verify**: Confirm we are on the `staging` branch with all changes committed and pushed.
2. **Checkout main**: `git checkout main`
3. **Pull latest**: `git pull origin main` to ensure main is up to date.
4. **Merge staging**: `git merge staging` — this should fast-forward or create a merge commit.
5. **Push main**: `git push origin main`
6. **Return to staging**: `git checkout staging`
7. **Notify**: Confirm the promotion is complete and that production is now live with the latest changes.

## Safety Rules

- This skill MUST NOT be invoked for any other phrase or request.
- If there are merge conflicts, STOP and report them to the user — do not resolve them automatically.
- After the merge, always switch back to `staging` immediately.
- Never make commits directly on `main` — all work flows through `staging`.
