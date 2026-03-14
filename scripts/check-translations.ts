import en from '../locales/en.json';
import es from '../locales/es.json';

type JsonObject = Record<string, unknown>;

function getLeafKeys(obj: JsonObject, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getLeafKeys(value as JsonObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const enKeys = new Set(getLeafKeys(en as unknown as JsonObject));
const esKeys = new Set(getLeafKeys(es as unknown as JsonObject));

const missingInEs = [...enKeys].filter((k) => !esKeys.has(k));
const extraInEs = [...esKeys].filter((k) => !enKeys.has(k));

let hasError = false;

if (missingInEs.length > 0) {
  console.error('❌ Keys in en.json missing from es.json:');
  missingInEs.forEach((k) => console.error(`  - ${k}`));
  hasError = true;
}

if (extraInEs.length > 0) {
  console.error('❌ Extra keys in es.json not in en.json:');
  extraInEs.forEach((k) => console.error(`  - ${k}`));
  hasError = true;
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`✅ All translation keys match (${enKeys.size} keys)`);
}
