# Dashgo Project TODO List

This file tracks planned features, improvements, and refactoring items for Dashgo.

## 🌐 Localization & i18n
- [ ] **Automated UI Translation Pipeline**
  - [ ] Configure `i18next` and `react-i18next` in the React frontend.
  - [ ] Extract all hardcoded strings into `frontend/src/locales/en.json`.
  - [ ] Write a translation script (`scripts/translate.js`) that compares source strings in `en.json` against target languages (`ru.json`, `zh.json`) and calls a local DeepLX instance to translate missing or modified values.
  - [ ] Create a GitHub Actions workflow (or update `release.yml`) that spins up `ghcr.io/owo-network/deeplx:latest` in the background and runs the translation script.
  - [ ] Implement a language selection dropdown in the Settings page.

## 🧪 Testing & CI/CD
- [ ] Add code coverage reporting for frontend tests (Vitest).
- [ ] Add end-to-end integration tests (e.g., using Playwright or Cypress).

## 🔒 Security
- [ ] Audit Firestore/database rules and verify secure API parameters (no raw shell execution, strict input validation).
