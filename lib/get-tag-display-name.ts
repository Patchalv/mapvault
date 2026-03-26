import i18n from '@/lib/i18n';

const VALID_DEFAULT_KEYS = ['restaurant', 'bar', 'cafe', 'friend'] as const;
type DefaultTagKey = (typeof VALID_DEFAULT_KEYS)[number];

/**
 * Returns the display name for a tag. Default tags (those with a default_key)
 * are translated using the current device locale. Custom tags return their
 * stored name as-is.
 */
export function getTagDisplayName(tag: { name: string; default_key?: string | null }): string {
  if (tag.default_key && (VALID_DEFAULT_KEYS as readonly string[]).includes(tag.default_key)) {
    return i18n.t(`defaultTags.${tag.default_key as DefaultTagKey}`);
  }
  return tag.name;
}
