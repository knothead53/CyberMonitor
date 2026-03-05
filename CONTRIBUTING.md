# Contributing to CyberMonitor

Thanks for contributing.

## Principles

- Keep architecture simple and easy to read.
- Prefer small, reviewable pull requests.
- Preserve static-host compatibility (no required backend for MVP paths).
- Do not add secrets, API keys, or paid service dependencies.

## Setup

1. Fork and clone the repository.
2. Open `frontend/index.html` to validate UI changes.
3. Update sample JSON under `data/` when adding new panel behavior.

## Pull Request Guidelines

- Use clear commit messages and explain user-facing changes.
- Include before/after screenshots for UI updates when possible.
- Keep JavaScript functions small and named by intent.
- Document new files or folders in `README.md`.

## Coding Standards

- Use plain HTML/CSS/JavaScript for MVP features.
- Keep comments concise and focused on non-obvious logic.
- Favor explicit naming over clever abstractions.
- Ensure layouts remain usable on desktop and mobile widths.

## Issue Reporting

When filing bugs, include:

- expected behavior
- actual behavior
- browser and version
- screenshot or console details if available
