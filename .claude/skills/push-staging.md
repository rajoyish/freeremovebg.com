# Push to Staging

Deploy the current changes to the staging environment.

## Workflow

1. **Verify branch**: Confirm we are on the `staging` branch (or a feature branch off `staging`).
2. **Build check**: Run `pnpm build` to ensure there are no build errors. If the project uses `pnpm dev` for development mode, confirm it starts without errors.
3. **Commit**: Stage all relevant changes and commit with a [conventional commit](https://www.conventionalcommits.org/) message.
4. **Push**: Push the branch to `origin staging`.
5. **Notify**: Tell the user the code has been pushed and is ready for review at the staging URL.

## Conventional Commit Format

Use one of these prefixes:
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance, config, dependencies
- `refactor:` — code restructuring without behavior change
- `style:` — formatting, CSS, visual changes
- `docs:` — documentation
- `test:` — adding or updating tests

Example: `feat: add interactive before/after image slider`

## Important

- Never push directly to `main` from this skill.
- If tests exist, run them before pushing.
- If the build fails, fix the errors and try again — do not push broken code.
