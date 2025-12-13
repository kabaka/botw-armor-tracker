# Agent Guidelines

## Scope
These instructions apply to the entire repository.

## Coding standards
- Prefer clear, readable JavaScript and HTML/CSS; avoid unnecessary complexity.
- Keep functions small and focused with descriptive names and inline comments only when they add clarity.
- Avoid introducing external dependencies unless necessary; prefer native browser APIs.
- Keep assets lightweight; do not add binary files to the repository.

## Quality gates
- Maintain or improve existing tests. Add unit or integration tests for new behavior where practical.
- Run available linters or test commands before committing. If no automated checks exist, ensure code builds and basic flows work locally.
- Validate that the PWA manifest/service worker remain functional after changes when relevant.
- The repository uses a Husky pre-commit hook to run `npm test`; keep it working and do not bypass it without justification.

## Documentation
- Update README and inline docs when behavior or setup steps change in a noticeable way.
- Summarize major features and usage; avoid exhaustive change logs.

## Git and PR
- Use Conventional Commit messages.
- Keep commits focused and descriptive. Include only necessary files.
- Ensure the repository remains in a buildable state after each commit.
