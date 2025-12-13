# BOTW Armor Tracker

A lightweight, offline-friendly tracker for managing armor sets, upgrades, and materials in *The Legend of Zelda: Breath of the Wild*. The app runs entirely in the browser, making it simple to use on desktop or mobile.

## Features
- Browse armor sets and individual pieces with icons and descriptions.
- Track upgrade progress and required materials for each level.
- Works offline using a service worker and cached assets.
- Installable as a Progressive Web App (PWA).

## Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/botw-armor-tracker.git
   cd botw-armor-tracker
   ```
2. Serve the static files with your preferred dev server, e.g.:
   ```bash
   npx serve .
   ```
3. Open the app in your browser at the provided local URL.

## Development
- The app is a static site built with vanilla JavaScript, HTML, and CSS.
- Primary entry points:
  - `index.html`: main page markup and PWA metadata.
  - `app.js`: core application logic for data loading and interactions.
  - `styles.css`: global styling and layout.
  - `sw.js`: service worker for caching assets.
  - `botw_armor_data.json`: armor data source.
- Use modern browsers for development and testing; no build step is required.

## Testing
- There is no dedicated test suite yet. When adding new features, consider lightweight unit tests (e.g., with Jest) for data utilities and manual verification for UI flows.

## Deployment
- Host the static files on any web server or static hosting provider.
- Ensure HTTPS to allow PWA installation and service worker registration.

## Contributing
- Use Conventional Commits for commit messages.
- Keep changes scoped and documented when behavior or setup steps change.
- Avoid adding large binary assets to the repository.

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
