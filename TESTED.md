# Verification status

Local Linux verification:
- C++ core sources compile with Clang C++20.
- Swift package manifest parses with Swift 6.2 on Linux.

Full macOS verification is intentionally delegated to `.github/workflows/macos-ci.yml`.
A release must not be presented as macOS-tested until that workflow completes successfully on a GitHub-hosted macOS runner.
