# CBCT Viewer macOS — verified-build workflow

This repository is configured so that every push is built and tested on a real GitHub-hosted macOS runner.

The CI pipeline:
1. builds the C++/Swift package on macOS;
2. runs core smoke tests;
3. creates a native `.app` bundle;
4. validates `Info.plist`;
5. ad-hoc signs and verifies the app bundle;
6. creates a ZIP with `ditto` on macOS;
7. validates the ZIP;
8. publishes the resulting ZIP as a GitHub Actions artifact.

The current build is a prototype and is not Apple-notarized. A Developer ID certificate and notarization can be added later for a normal double-click distribution outside the App Store.
