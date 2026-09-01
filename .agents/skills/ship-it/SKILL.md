---
name: ship-it
description: Trigger when the user says "ship it", "commit and pr", "deploy this", or runs "/ship".
---

# Ship It: Commit, Push, and PR Workflow

When triggered, follow this exact workflow:

1. **Pre-flight Check**: Use the `run_command` tool to execute `git status --porcelain`. If the output is completely empty, inform the user there are no changes to commit and stop execution.
2. **Branch Management**: Use the `run_command` tool to execute `git branch --show-current`.
   - If the output is `main`, you must create a new feature branch. Generate a concise, contextual branch name based on the changes (e.g., `feat/esewa-payment`, `fix/sidebar-ui`, `refactor/inertia-components`). Use `run_command` to execute `git checkout -b <generated-branch-name>`.
   - If the output is not `main`, stay on the current branch.
3. **Stage Changes**: Run `git add .` to stage all modified, deleted, and untracked files, then execute `git diff --staged` to read the changes.
4. **Generate Commit Message**: Read the staged diff output. Generate a commit message based on the diff in this exact format:

   type(scope): short subject

   - bullet of what changed
   - bullet of why

5. **Commit**: Use the `run_command` tool to execute `git commit -m "<generated message>"`.
6. **Push**: Use the `run_command` tool to execute `git push -u origin HEAD` to push the branch to the remote repository.
7. **Create or Update Pull Request**: Use the `run_command` tool to execute `gh pr view`.
   - If the command succeeds (a PR already exists), you are done. Output a brief success message.
   - If the command fails (no PR exists), use `run_command` to execute `gh pr create --base main --title "<type(scope): short subject>" --body "<the body bullets> \n\n > **Note:** Merging this PR will trigger the automated deployment pipeline."`.

## Commit Message Rules:
- **Types**: Use one of `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`.
- **Scope**: Keep scopes relevant to the architecture (e.g., `ui`, `api`, `deps`, `auth`, `seo`).
- **Subject**: Must be under 60 characters and in the imperative mood (e.g., "add eSewa QR", not "added eSewa QR").
- **Body bullets**: Mandatory if the code change spans multiple files or complex logic.
- **NEVER** include a Co-Authored-By trailer.
