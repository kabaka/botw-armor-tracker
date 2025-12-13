# BOTW Armor Tracker

A lightweight, offline-friendly tracker for managing armor sets, upgrades, and materials in *The Legend of Zelda: Breath of the Wild*. The app runs entirely in the browser, making it simple to use on desktop or mobile.

## Features
- Browse armor sets and individual pieces with icons and descriptions.
- Track upgrade progress and required materials for each level.
- Adjust material inventory directly from armor upgrade details or the Materials tab.
- Works offline using a service worker and cached assets.
- Installable as a Progressive Web App (PWA).

## Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/botw-armor-tracker.git
   cd botw-armor-tracker
   ```
2. Install dependencies for running tests:
   ```bash
   npm ci
   ```
3. Serve the static files with your preferred dev server, e.g.:
   ```bash
   npx serve .
   ```
4. Open the app in your browser at the provided local URL.

## Development
- The app is a static site built with vanilla JavaScript, HTML, and CSS.
- Primary entry points:
  - `index.html`: main page markup and PWA metadata.
  - `app.js`: bootstrap that wires state loading to the UI layer.
  - `src/state.js`: data loading, validation, and local state helpers.
  - `src/ui.js`: rendering logic and in-browser interactions.
  - `styles.css`: global styling and layout.
  - `sw.js`: service worker for caching assets.
- `data/botw_armor_data.json`: armor data source.
- `data/armor_sources.json`: curated acquisition info shown in the UI.
- Use modern browsers for development and testing; no build step is required.

## Testing
- Run the automated data integrity tests:
  ```bash
  npm test
  ```
- Tests rely on [Vitest](https://vitest.dev) with a [jsdom](https://github.com/jsdom/jsdom) environment configured in `vitest.config.js` so DOM-driven UI logic and the service worker can be exercised headlessly.
- A Husky pre-commit hook runs `npm test` automatically after you install dependencies, helping catch regressions before code is pushed.

## Deployment
- Host the static files on any web server or static hosting provider.
- Ensure HTTPS to allow PWA installation and service worker registration.
- The repository includes a GitHub Actions workflow that, on pushes to `main`, runs tests and deploys the contents of the `dist` folder to GitHub Pages.

## Continuous Integration & Automation
- Pull requests to `main` automatically run the test suite via GitHub Actions to prevent regressions.
- Merges to `main` re-run the tests and, on success, publish the site to GitHub Pages.
- Dependabot is configured to open weekly updates for npm packages and GitHub Actions to keep dependencies current.

## Contributing
- Use Conventional Commits for commit messages.
- Keep changes scoped and documented when behavior or setup steps change.
- Avoid adding large binary assets to the repository.

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
