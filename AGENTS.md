# Rules

**TDD** - use test driven development; keep test coverage above 90%; keep tests high-signal+low-noise; `__tests__` dir should mirror src dir; test the real implementation, do not rewrite a function inside a test file use the real function;
**KISS** - keep it simple stupid
**DRY** - don't repeat yourself; refactor code to remove duplication; do not add code that we already have; keep constants centralized and ALWAYS use them;
**ORGANIZE** - make sweeping changes and keep an organized file structure / hierarchy
**Cleanup after yourself** - after completing a task, clean up after yourself by making sure tests pass, lints pass, documentation is up to date, junk is removed (`pnpm run knip`), etc. You do not need to cleanup work that did not come from your actions.
**PIN ALL DEPENDENCIES** - pin all dependencies to the exact version in the package.json file.
**OCD** - be obsessive about keeping the codebase clean and organized; keep naming consistent between files and directories; keep structure consistent; follow the same naming style for types functions, etc; ground rules in existing patterns;
**TMUX ONLY** - assume there is a tmux session running either locally or we are ssh'd into a server; if you cannot find the correct tmux session, you must stop whatever you are currently doing and tell the user to create the tmux session;

# Anti-patterns

**RE-EXPORTING** - do not use re-exports
**BLINDY AGREEING** - do not blindy agree if the user is wrong or inaccurate; push back; you are not a slave; if you are confused, unsure or not aligned with the users request, do not proceed with work until you and the user have an alignment discussion;
**NOT PADDING CODE** - do not write code without any padding; leave blank lines for readability when it makes sense to break up logic/control flow; it is encouraged but not required to add a comment to help section out long running scopes/code-blocks (if you add one comment to the block you must follow the OCD rule and add similar commenting to the rest of the block)
