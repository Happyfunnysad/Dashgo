# Issue: Implement Automated UI Translation Pipeline (en/ru/zh) using DeepLX

**Goal**: Automatically localize the React frontend into Russian (`ru`) and Chinese (`zh`) when new keys are added to the English base language (`en.json`), using a local DeepLX Docker service in CI/CD (GitHub Actions) without requiring paid translation API keys.

---

## Step 1: Configure i18n in the React Frontend

1. **Install Dependencies**:
   Install `i18next`, `react-i18next`, and `i18next-browser-languagedetector` inside the `frontend` directory:
   ```bash
   cd frontend
   npm install i18next react-i18next i18next-browser-languagedetector
   ```

2. **Create the Locale Files Directory**:
   Create a folder to store the translation JSON files:
   `frontend/src/locales/`
   - `en.json` (Source of truth)
   - `ru.json` (Auto-generated/updated)
   - `zh.json` (Auto-generated/updated)

3. **Initialize base English locale (`frontend/src/locales/en.json`)**:
   ```json
   {
     "common": {
       "save": "Save",
       "cancel": "Cancel",
       "loading": "Loading..."
     },
     "dashboard": {
       "title": "Docker Containers Dashboard",
       "cpu": "CPU Usage",
       "ram": "RAM Usage"
     },
     "settings": {
       "title": "Settings",
       "language": "Language"
     }
   }
   ```

4. **Initialize `i18n.ts` (`frontend/src/i18n.ts`)**:
   ```typescript
   import i18n from 'i18next';
   import { initReactI18next } from 'react-i18next';
   import LanguageDetector from 'i18next-browser-languagedetector';

   import en from './locales/en.json';
   import ru from './locales/ru.json';
   import zh from './locales/zh.json';

   i18n
     .use(LanguageDetector)
     .use(initReactI18next)
     .init({
       resources: {
         en: { translation: en },
         ru: { translation: ru },
         zh: { translation: zh }
       },
       fallbackLng: 'en',
       interpolation: {
         escapeValue: false // React already escapes values to prevent XSS
       }
     });

   export default i18n;
   ```

5. **Import `i18n.ts` in Main Entrypoint (`frontend/src/main.tsx`)**:
   Add the following line at the top:
   ```typescript
   import './i18n';
   ```

6. **Wrap UI texts with `useTranslation` hook**:
   ```tsx
   import { useTranslation } from 'react-i18next';

   export function Settings() {
     const { t } = useTranslation();
     return <h1>{t('settings.title')}</h1>;
   }
   ```

---

## Step 2: Create the Automatic Translation Script

Write a Node.js script in `frontend/scripts/translate.js` that scans `en.json`, identifies keys missing in `ru.json` or `zh.json` (or keys whose English values changed), calls the DeepLX instance running on `http://localhost:1188/translate`, translates them, and updates the translation files.

Create `frontend/scripts/translate.js`:
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../src/locales');
const DEEPLX_URL = 'http://localhost:1188/translate';
const TARGET_LANGS = [
  { code: 'ru', deepLCode: 'RU' },
  { code: 'zh', deepLCode: 'ZH' }
];

async function translateText(text, targetLang) {
  try {
    const response = await fetch(DEEPLX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        source_lang: 'EN',
        target_lang: targetLang
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.code === 200 && result.data) {
      return result.data;
    }
    throw new Error(result.message || 'Unknown DeepLX API error');
  } catch (error) {
    console.error(`❌ Failed to translate "${text}" to ${targetLang}:`, error.message);
    return null;
  }
}

// Helper to recursively translate nested JSON structure
async function syncKeys(sourceObj, targetObj, targetLang) {
  const synced = { ...targetObj };
  
  for (const key in sourceObj) {
    if (typeof sourceObj[key] === 'object' && sourceObj[key] !== null) {
      // Key holds a nested object
      synced[key] = await syncKeys(sourceObj[key], targetObj[key] || {}, targetLang);
    } else {
      // Key holds a string translation
      const sourceVal = sourceObj[key];
      const targetVal = targetObj[key];
      
      // Translate if target key is missing, empty, or if we want to force translate
      if (!targetVal || targetVal === '') {
        console.log(`🌍 Translating: "${sourceVal}" -> [${targetLang}]`);
        const translated = await translateText(sourceVal, targetLang);
        if (translated) {
          synced[key] = translated;
          // Add a small delay to avoid overwhelming the local/remote service
          await new Promise(r => setTimeout(r, 200));
        } else {
          synced[key] = sourceVal; // Fallback to English if translation fails
        }
      } else {
        synced[key] = targetVal;
      }
    }
  }
  
  // Clean up keys that no longer exist in sourceObj
  for (const key in synced) {
    if (!(key in sourceObj)) {
      delete synced[key];
    }
  }
  
  return synced;
}

async function main() {
  const enPath = path.join(LOCALES_DIR, 'en.json');
  if (!fs.existsSync(enPath)) {
    console.error(`❌ Base file en.json not found at: ${enPath}`);
    process.exit(1);
  }
  
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  
  for (const lang of TARGET_LANGS) {
    const filePath = path.join(LOCALES_DIR, `${lang.code}.json`);
    let langData = {};
    
    if (fs.existsSync(filePath)) {
      try {
        langData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        console.warn(`⚠️ Warning: Could not parse existing ${lang.code}.json. Starting fresh.`);
      }
    }
    
    console.log(`\n🔄 Syncing ${lang.code}.json...`);
    const updatedData = await syncKeys(enData, langData, lang.deepLCode);
    
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2) + '\n', 'utf8');
    console.log(`✅ ${lang.code}.json successfully updated.`);
  }
}

main().catch(err => {
  console.error('❌ Critical script failure:', err);
  process.exit(1);
});
```

---

## Step 3: Integrate into GitHub Actions Workflow

To make this translate automatically on releases or pushes, we can run DeepLX in a Docker container in the background during the workflow.

Add a translation step inside `.github/workflows/release.yml` or create a new dedicated `.github/workflows/translate.yml`:

```yaml
name: Auto Translation

on:
  push:
    branches:
      - main
    paths:
      - 'frontend/src/locales/en.json'

jobs:
  translate:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      # 1. Spin up DeepLX service locally on the runner
      - name: Start DeepLX Service
        run: |
          docker run -d -p 1188:1188 ghcr.io/owo-network/deeplx:latest
          
      # 2. Wait for the service to be healthy
      - name: Wait for DeepLX
        run: |
          for i in {1..10}; do
            if curl -s http://localhost:1188 > /dev/null; then
              echo "DeepLX is up and running!"
              exit 0
            fi
            echo "Waiting for DeepLX..."
            sleep 2
          done
          echo "DeepLX failed to start"
          exit 1

      # 3. Setup Node.js environment
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: 'frontend/package-lock.json'

      # 4. Run the sync and translate script
      - name: Run Translation Script
        run: |
          cd frontend
          node scripts/translate.js

      # 5. Commit and push back translation changes (if any)
      - name: Commit and Push Translations
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: Auto-translate missing UI strings [skip ci]"
          file_pattern: "frontend/src/locales/*.json"
```

---

## Step 4: Add Language Switcher in Settings UI

Create a dropdown language selector component or place it directly in the settings page:

```tsx
import { useTranslation } from 'react-i18next';

export function LanguageSelector() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-gray-400">Language / Язык / 语言</label>
      <select
        value={i18n.language}
        onChange={(e) => changeLanguage(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-white rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="en">English</option>
        <option value="ru">Русский</option>
        <option value="zh">中文 (简体)</option>
      </select>
    </div>
  );
}
```
