# MapVault — i18n Localization Implementation Plan

## Overview

This document is the complete implementation plan for adding internationalization (i18n)
to the MapVault Expo React Native app. It covers:

- Full infrastructure setup (expo-localization + i18next + react-i18next)
- Migration of all existing hardcoded strings to translation keys
- TypeScript type safety for translation keys
- Automated validation (pre-commit hook via Husky)
- CLAUDE.md guardrail rules for ongoing development
- Patterns for dynamic strings, interpolation, and pluralization

**Languages supported at launch:**
- English (`en`) — default and fallback
- Spanish (`es`) — secondary

**Rule:** If the device language is not `en` or `es`, always fall back to English.

---

## 📋 First-Pass Review Checklist for Claude Code

Before implementing anything, Claude Code must complete this review:

- [ ] Confirm the project root location of `app/_layout.tsx` (Expo Router entry point)
- [ ] List all files under `app/` and `components/` that contain user-facing strings
- [ ] Check if `lib/` exists or if a different path is used for shared utilities
- [ ] Check if a `scripts/` directory exists at the project root
- [ ] Check if Husky is already installed (`cat package.json | grep husky`)
- [ ] Check if `.husky/` directory already exists
- [ ] Check if `types/` exists or confirm where TypeScript declaration files live
- [ ] Confirm the exact import path used for constants (`lib/constants.ts` or similar)
- [ ] Search the entire codebase for any existing i18n setup:
  ```bash
  grep -r "i18n\|i18next\|useTranslation\|expo-localization" --include="*.ts" --include="*.tsx" .
  ```
- [ ] Search for all hardcoded user-facing strings (see Migration section)
- [ ] Check `package.json` for the current Node and Expo SDK versions
- [ ] Confirm `ts-node` is available or determine the correct way to run TypeScript scripts in this project

**If any of the above paths differ from what this plan assumes, adjust all file paths in this
plan accordingly before implementing.**

---

## 📚 Required Documentation

Claude Code must fetch and read these before implementing:

1. **Expo Localization Guide:** https://docs.expo.dev/guides/localization/
2. **expo-localization API:** https://docs.expo.dev/versions/latest/sdk/localization/
3. **i18next Documentation:** https://www.i18next.com/overview/getting-started
4. **react-i18next Documentation:** https://react.i18next.com/getting-started
5. **i18next TypeScript Guide:** https://www.i18next.com/overview/typescript

---

## Step 1 — Install Dependencies

`expo-localization` is already installed (`~17.0.8`). Only install the missing packages:

```bash
npm install i18next react-i18next
npm install --save-dev husky tsx
```

**Note:** `tsx` is required to run `scripts/check-translations.ts` in Node. It is NOT
a runtime dependency — dev only. `ts-node` is NOT used: it is not installed in this
project and is incompatible with the project's `tsconfig.json` which uses
`"module": "preserve"` and `"moduleResolution": "bundler"` (Expo SDK 54 defaults).

After installing, verify the installed versions and note them in a comment at the top
of `lib/i18n.ts`.

---

## Step 2 — Create Translation Files

Create the following directory and files at the project root (alongside `lib/`, `components/`, etc.):

```
locales/
  en.json   ← source of truth
  es.json   ← must always mirror the exact key structure of en.json
```

### `locales/en.json`

This is a starter structure. Claude Code must expand this based on the actual
strings found in the codebase during migration (Step 6).

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "loading": "Loading...",
    "error": "Something went wrong",
    "retry": "Try again",
    "confirm": "Confirm"
  },
  "explore": {
    "title": "Explore",
    "searchPlaceholder": "Search places...",
    "filterButton": "Filter"
  },
  "emptyState": {
    "noPlacesFound": "No places found",
    "saveFirstPlace": "Save your first place",
    "buildYourMap": "Start building your personal map by adding places you love or want to visit."
  },
  "addPlace": {
    "title": "Add Place",
    "searchPlaceholder": "Search for a place...",
    "saveButton": "Save Place",
    "notesPlaceholder": "Add a note..."
  },
  "map": {
    "title": "Map"
  },
  "profile": {
    "signOut": "Sign Out",
    "loadingProfile": "Loading your profile...",
    "manageMaps": "Manage Maps",
    "newMap": "New Map",
    "freeUpgrade": "free - upgrade",
    "premium": "premium",
    "rateMapVault": "Rate MapVault",
    "deleteAccount": "Delete account",
    "privacyPolicy": "Privacy Policy",
    "termsOfService": "Terms of Service"
  },
  "auth": {
    "signIn": "Sign In",
    "continueWithGoogle": "Continue with Google"
  },
  "premium": {
    "upgradeBanner": "Upgrade to Premium",
    "limitReached": "Map Limit Reached",
    "limitMessage": "Free accounts are limited to 1 map. Upgrade to premium for unlimited maps.",
    "upgradeButton": "Upgrade",
    "restorePurchases": "Restore Purchases",
    "features": {
      "unlimited": "Unlimited places",
      "sharing": "Share maps with others",
      "roles": "Manage collaborators"
    }
  },
  "places": {
    "deleteConfirm": "Delete this place?",
    "deleteMessage": "This action cannot be undone."
  },
  "filter": {
    "title": "Filters",
    "clearAll": "Clear all",
    "searchPlaceholder": "Search places...",
    "tags": "Tags",
    "status": "Status",
    "all": "All",
    "visited": "Visited",
    "notVisited": "Not visited",
    "switchToMapMessage": "Switch to a specific map to filter by tags"
  },
  "placeDetail": {
    "editTags": "Edit Tags",
    "addTags": "Add tags",
    "editNote": "Edit Note",
    "addNote": "Add note...",
    "visited": "Visited",
    "notVisited": "Not visited",
    "directions": "Directions",
    "deletePlace": "Delete Place",
    "deleteConfirm": "Delete {{placeName}}?",
    "deleteMessage": "This action cannot be undone."
  },
  "mapSettings": {
    "title": "Map Settings",
    "mapName": "Map Name",
    "tags": "Tags",
    "addTag": "Add Tag",
    "noTagsYet": "No tags yet",
    "members": "Members",
    "dangerZone": "Danger Zone",
    "deleteMap": "Delete Map",
    "leaveMap": "Leave Map"
  },
  "invite": {
    "processing": "Processing invite...",
    "joined": "You joined {{mapName}}!",
    "createInvite": "Create Invite",
    "createAndShare": "Create & Share",
    "copyLink": "Copy Link"
  },
  "tagEditor": {
    "editTitle": "Edit Tag",
    "newTitle": "New Tag",
    "namePlaceholder": "Tag name",
    "color": "Color",
    "saveChanges": "Save Changes",
    "createTag": "Create Tag",
    "deleteTag": "Delete Tag"
  },
  "deleteAccount": {
    "subscriptionWarning": "If you have an active subscription, cancel it before deleting your account.",
    "deleteButton": "Delete My Account"
  },
  "paywall": {
    "welcomeToPremium": "Welcome to Premium!",
    "restored": "Restored!",
    "noPurchasesFound": "No Purchases Found",
    "purchaseFailed": "Purchase Failed"
  }
}
```

### `locales/es.json`

Must have the **exact same key structure** as `en.json`. No extra keys, no missing keys.

```json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "loading": "Cargando...",
    "error": "Algo salió mal",
    "retry": "Intentar de nuevo",
    "confirm": "Confirmar"
  },
  "explore": {
    "title": "Explorar",
    "searchPlaceholder": "Buscar lugares...",
    "filterButton": "Filtrar"
  },
  "emptyState": {
    "noPlacesFound": "No se encontraron lugares",
    "saveFirstPlace": "Guarda tu primer lugar",
    "buildYourMap": "Empieza a construir tu mapa personal añadiendo lugares que te encantan o quieres visitar."
  },
  "addPlace": {
    "title": "Añadir lugar",
    "searchPlaceholder": "Busca un lugar...",
    "saveButton": "Guardar lugar",
    "notesPlaceholder": "Añade una nota..."
  },
  "map": {
    "title": "Mapa"
  },
  "profile": {
    "signOut": "Cerrar sesión",
    "loadingProfile": "Cargando tu perfil...",
    "manageMaps": "Gestionar mapas",
    "newMap": "Nuevo mapa",
    "freeUpgrade": "gratis - mejorar",
    "premium": "premium",
    "rateMapVault": "Valorar MapVault",
    "deleteAccount": "Eliminar cuenta",
    "privacyPolicy": "Política de privacidad",
    "termsOfService": "Términos de servicio"
  },
  "auth": {
    "signIn": "Iniciar sesión",
    "continueWithGoogle": "Continuar con Google"
  },
  "premium": {
    "upgradeBanner": "Hazte Premium",
    "limitReached": "Límite de mapas alcanzado",
    "limitMessage": "Las cuentas gratuitas están limitadas a 1 mapa. Mejora a premium para mapas ilimitados.",
    "upgradeButton": "Mejorar",
    "restorePurchases": "Restaurar compras",
    "features": {
      "unlimited": "Lugares ilimitados",
      "sharing": "Comparte mapas con otros",
      "roles": "Gestiona colaboradores"
    }
  },
  "places": {
    "deleteConfirm": "¿Eliminar este lugar?",
    "deleteMessage": "Esta acción no se puede deshacer."
  },
  "filter": {
    "title": "Filtros",
    "clearAll": "Limpiar todo",
    "searchPlaceholder": "Buscar lugares...",
    "tags": "Etiquetas",
    "status": "Estado",
    "all": "Todos",
    "visited": "Visitado",
    "notVisited": "No visitado",
    "switchToMapMessage": "Cambia a un mapa específico para filtrar por etiquetas"
  },
  "placeDetail": {
    "editTags": "Editar etiquetas",
    "addTags": "Añadir etiquetas",
    "editNote": "Editar nota",
    "addNote": "Añade una nota...",
    "visited": "Visitado",
    "notVisited": "No visitado",
    "directions": "Cómo llegar",
    "deletePlace": "Eliminar lugar",
    "deleteConfirm": "¿Eliminar {{placeName}}?",
    "deleteMessage": "Esta acción no se puede deshacer."
  },
  "mapSettings": {
    "title": "Configuración del mapa",
    "mapName": "Nombre del mapa",
    "tags": "Etiquetas",
    "addTag": "Añadir etiqueta",
    "noTagsYet": "Sin etiquetas aún",
    "members": "Miembros",
    "dangerZone": "Zona de peligro",
    "deleteMap": "Eliminar mapa",
    "leaveMap": "Abandonar mapa"
  },
  "invite": {
    "processing": "Procesando invitación...",
    "joined": "¡Te uniste a {{mapName}}!",
    "createInvite": "Crear invitación",
    "createAndShare": "Crear y compartir",
    "copyLink": "Copiar enlace"
  },
  "tagEditor": {
    "editTitle": "Editar etiqueta",
    "newTitle": "Nueva etiqueta",
    "namePlaceholder": "Nombre de la etiqueta",
    "color": "Color",
    "saveChanges": "Guardar cambios",
    "createTag": "Crear etiqueta",
    "deleteTag": "Eliminar etiqueta"
  },
  "deleteAccount": {
    "subscriptionWarning": "Si tienes una suscripción activa, cancélala antes de eliminar tu cuenta.",
    "deleteButton": "Eliminar mi cuenta"
  },
  "paywall": {
    "welcomeToPremium": "¡Bienvenido a Premium!",
    "restored": "¡Restaurado!",
    "noPurchasesFound": "No se encontraron compras",
    "purchaseFailed": "Error en la compra"
  }
}
```

---

## Step 3 — Create i18n Config

Create `lib/i18n.ts`:

```typescript
// i18n configuration for MapVault
// Dependencies: expo-localization, i18next, react-i18next
// Supported languages: en (default), es

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from '@/locales/en.json';
import es from '@/locales/es.json';

const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

function getDeviceLanguage(): SupportedLanguage {
  const locales = Localization.getLocales();
  const deviceLang = locales?.[0]?.languageCode ?? 'en';
  return SUPPORTED_LANGUAGES.includes(deviceLang as SupportedLanguage)
    ? (deviceLang as SupportedLanguage)
    : 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    // Ensure missing keys fall back to English silently
    saveMissing: false,
    missingKeyHandler: false,
  });

export default i18n;
export { SUPPORTED_LANGUAGES };
export type { SupportedLanguage };
```

---

## Step 4 — Register at App Root

In `app/_layout.tsx`, add this import as the **second line of the file**, immediately
after `import "@/global.css"` and before all other imports:

```typescript
import "@/global.css";
import '@/lib/i18n'; // Must initialize before any component renders — keep second, after global.css
```

**Warning:** `import "@/global.css"` MUST remain the absolute first import in
`_layout.tsx`. It applies NativeWind's patches to React Native's `View`, `Text`,
`Pressable`, etc. Moving it to any position other than first will break all NativeWind
`className` styling across the entire app. The i18n import goes second — not first.

---

## Step 5 — Add TypeScript Type Safety

Create `types/i18next.d.ts`:

```typescript
// This file makes t() type-safe.
// t('valid.key') ✅
// t('invalid.key') ❌ TypeScript compile error
// t('explore.typo') ❌ TypeScript compile error

import en from '@/locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
```

After adding this file, restart the TypeScript server in VS Code:
`Cmd+Shift+P → TypeScript: Restart TS Server`

---

## Step 6 — Migrate All Existing Hardcoded Strings

### How to find hardcoded strings

Run this search across the project to find all user-facing hardcoded text:

```bash
# Find JSX text content (strings between tags or in string props)
grep -rn \
  --include="*.tsx" \
  --include="*.ts" \
  -E '(title=|placeholder=|label=|message=|description=|header=)["\x27][A-Z]' \
  app/ components/

# Also look for Text components with hardcoded content
grep -rn --include="*.tsx" -E '<Text[^>]*>[A-Z][a-z]' app/ components/
```

### Migration pattern

For every hardcoded string found:

**Before:**
```typescript
<Text>No places found</Text>
<TextInput placeholder="Search places..." />
<Button title="Save Place" />
```

**After:**
```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

<Text>{t('emptyState.noPlacesFound')}</Text>
<TextInput placeholder={t('explore.searchPlaceholder')} />
<Button title={t('addPlace.saveButton')} />
```

### Dynamic strings with interpolation

For strings that contain variables:

**`en.json`:**
```json
{
  "placeDetail": {
    "deleteConfirm": "Delete {{placeName}}?"
  }
}
```

**Usage:**
```typescript
t('placeDetail.deleteConfirm', { placeName: 'Bar Marsella' })
// Output: "Delete Bar Marsella?"
```

**`es.json`:**
```json
{
  "placeDetail": {
    "deleteConfirm": "¿Eliminar {{placeName}}?"
  }
}
```

### Pluralization

For strings that change based on count (e.g., "1 place" vs "5 places"):

**`en.json`:**
```json
{
  "places": {
    "count_one": "{{count}} place",
    "count_other": "{{count}} places"
  }
}
```

**`es.json`:**
```json
{
  "places": {
    "count_one": "{{count}} lugar",
    "count_other": "{{count}} lugares"
  }
}
```

**Usage:**
```typescript
t('places.count', { count: 1 })   // "1 place" / "1 lugar"
t('places.count', { count: 5 })   // "5 places" / "5 lugares"
```

**Important:** i18next uses `_one` and `_other` suffixes automatically based on
the `count` variable. Do not handle this manually. Refer to:
https://www.i18next.com/translation-function/plurals

### Strings outside React components (utility functions, Supabase callbacks, etc.)

For strings used outside of React components (where hooks are unavailable):

```typescript
import i18n from '@/lib/i18n';

// Use the i18n instance directly
const message = i18n.t('errors.networkError');
```

### What NOT to migrate

Do not use `t()` for:
- Route names (`/explore`, `/settings`)
- Supabase table or column names
- API keys or environment variables
- TypeScript type names or enum values
- `console.log` messages
- Internal error codes (e.g., `PGRST116`)
- The app bundle ID (`com.patrickalvarez.mapvault`)
- PostHog event names
- RevenueCat entitlement IDs

---

## Step 7 — Validation Script

Create `scripts/check-translations.ts`:

```typescript
/**
 * Translation key validation script.
 * Ensures en.json and es.json have exactly the same keys.
 * Run manually: npm run check:i18n
 * Run automatically: pre-commit hook (see Step 8)
 */

import en from '../locales/en.json';
import es from '../locales/es.json';

function getKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return getKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

const enKeys = getKeys(en as Record<string, unknown>).sort();
const esKeys = getKeys(es as Record<string, unknown>).sort();

const missingInEs = enKeys.filter(k => !esKeys.includes(k));
const missingInEn = esKeys.filter(k => !enKeys.includes(k));

let hasErrors = false;

if (missingInEs.length > 0) {
  console.error('\n❌ Keys in en.json but missing from es.json:');
  missingInEs.forEach(k => console.error(`   - ${k}`));
  hasErrors = true;
}

if (missingInEn.length > 0) {
  console.error('\n❌ Keys in es.json but missing from en.json:');
  missingInEn.forEach(k => console.error(`   - ${k}`));
  hasErrors = true;
}

if (hasErrors) {
  console.error('\n❌ Translation check failed. Fix the above before committing.\n');
  process.exit(1);
} else {
  console.log('\n✅ All translation keys match across en.json and es.json.\n');
}
```

Add the script to `package.json` scripts:

```json
{
  "scripts": {
    "check:i18n": "npx tsx scripts/check-translations.ts"
  }
}
```

**Note:** `tsx` does not need `--project tsconfig.json` — it auto-discovers tsconfig
and handles `resolveJsonModule` natively. Do not use `ts-node` here.

---

## Step 8 — Pre-commit Hook (Husky)

Husky is not yet installed. Install it and initialize:

```bash
npm install --save-dev husky
npx husky init
```

This creates a `.husky/` directory and auto-generates `.husky/pre-commit` with default
content (`npm test`). **Replace the entire contents** of `.husky/pre-commit` with:

```
npm run check:i18n
```

Do not append — replace the whole file. The default `npm test` content must be removed.

Verify the file is executable:

```bash
chmod +x .husky/pre-commit
```

Verify it works by making a test commit. The `check:i18n` script should run
automatically. If it fails (e.g., because of a missing key), the commit is blocked.

---

## Step 9 — Update CLAUDE.md

Add the following section to the project's `CLAUDE.md` file. If `CLAUDE.md` does not
exist at the project root, create it.

```markdown
## Internationalization (i18n)

MapVault supports English (`en`) and Spanish (`es`).
English is the default and fallback language for all users.

Translation files are located at:
- `locales/en.json` — source of truth
- `locales/es.json` — must always mirror the exact key structure of en.json

### ⛔ Non-negotiable rules

1. **Never hardcode user-facing strings.** All UI text must use `t('key')`.
   There are no exceptions. If a string is visible to the user, it must be in the
   translation files.

2. **Always update both files together.** When you add, edit, or remove any
   translation key, you must update BOTH `en.json` AND `es.json` in the same change.
   Never update one without the other.

3. **When editing English wording**, always review the Spanish translation and update
   it if the meaning has changed. Do not leave stale Spanish translations.

4. **After any change to translation files**, run:
   ```bash
   npm run check:i18n
   ```
   This must pass before the task is considered complete.

5. **Never add a key to one file without adding it to the other.**

### How to use in a React component

```typescript
import { useTranslation } from 'react-i18next';

export default function MyComponent() {
  const { t } = useTranslation();
  return <Text>{t('explore.title')}</Text>;
}
```

### How to use outside a React component

```typescript
import i18n from '@/lib/i18n';
const message = i18n.t('common.error');
```

### Key naming convention

Use dot-separated, camelCase keys grouped by screen or domain:

```
common.save
explore.title
addPlace.searchPlaceholder
premium.limitReached
placeDetail.deleteConfirm
```

### Dynamic strings (interpolation)

```typescript
// en.json: "deleteConfirm": "Delete {{placeName}}?"
t('placeDetail.deleteConfirm', { placeName: 'Bar Marsella' })
```

### Pluralization

```typescript
// en.json: "count_one": "{{count}} place", "count_other": "{{count}} places"
t('places.count', { count: 1 })  // "1 place"
t('places.count', { count: 5 })  // "5 places"
```

### What NOT to translate

- Route names (`/explore`, `/settings`)
- Supabase table/column names
- API keys and environment variables
- TypeScript types and enum values
- `console.log` messages
- Internal error codes
- PostHog event names
- RevenueCat entitlement IDs
- App bundle ID
```

---

## Step 10 — Final Verification

After all steps are complete, run the following checklist:

### Functional checks
- [ ] Run `npm run check:i18n` — must pass with zero errors
- [ ] Change device language to Spanish in iOS Simulator and reload the app —
      all strings should appear in Spanish
- [ ] Change device language to a language not supported (e.g., French) —
      all strings should fall back to English
- [ ] Change device language back to English — all strings should appear in English
- [ ] Verify no raw translation keys are visible anywhere in the UI (e.g., `explore.title`)

### Code checks
- [ ] No hardcoded user-facing strings remain in `app/` or `components/`
- [ ] `types/i18next.d.ts` exists
- [ ] `lib/i18n.ts` exists and is imported first in `app/_layout.tsx`
- [ ] `locales/en.json` and `locales/es.json` exist and have matching keys
- [ ] `scripts/check-translations.ts` exists and runs correctly
- [ ] `.husky/pre-commit` exists and runs `npm run check:i18n`
- [ ] `CLAUDE.md` has been updated with the i18n rules section

### TypeScript checks
- [ ] Intentionally type `t('explore.typooo')` somewhere and confirm a TypeScript
      error appears. Then remove it.

---

## Adding a New Language in the Future

When a third language needs to be added (e.g., Portuguese):

1. Create `locales/pt.json` with all keys from `en.json` translated
2. In `lib/i18n.ts`, import the file and add it to `resources`
3. Add `'pt'` to the `SUPPORTED_LANGUAGES` array
4. Run `npm run check:i18n` to confirm all three files match
5. Test on a device set to Portuguese

---

## Notes for Claude Code

- The translation files provided in this plan are starters. The real source of truth
  is the actual strings found in the codebase. During migration (Step 6), add every
  discovered string to both files before replacing it with `t()`.
- If you find a string that does not fit the existing key groups, create a new group.
  Use your judgment to keep the structure clean and predictable.
- If you encounter a string used in both a React component and a utility function,
  add it to the translation files once and use it from both places.
- Do not split the implementation across multiple sessions without completing
  Step 10 verification first. A partial migration is worse than no migration
  (some strings translated, some not).
