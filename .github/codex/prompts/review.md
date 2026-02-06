# Codex PR Review

Review this pull request and flag only P0/P1 issues.
Focus on:
- Crashes, runtime errors, wrong behavior
- Security/privacy issues
- Performance regressions (React Native: no fetch in onPress, lists need unique keys)
- Breaking changes / unintended side-effects

Output:
- A short bullet list of issues (P0/P1 only) with file + line references when possible.
- If no P0/P1 issues: say "No P0/P1 issues found."
