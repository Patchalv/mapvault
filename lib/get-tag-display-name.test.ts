import i18n from '@/lib/i18n';
import { getTagDisplayName } from '@/lib/get-tag-display-name';

describe('getTagDisplayName', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates a default tag rather than using its stored name', () => {
    expect(getTagDisplayName({ name: 'stored-restaurant', default_key: 'restaurant' })).toBe(
      'Restaurant',
    );
  });

  it('follows the active locale for default tags', async () => {
    await i18n.changeLanguage('es');

    expect(getTagDisplayName({ name: 'stored-restaurant', default_key: 'restaurant' })).toBe(
      'Restaurante',
    );
  });

  it('returns a custom tag name as-is', () => {
    expect(getTagDisplayName({ name: 'Rooftop', default_key: null })).toBe('Rooftop');
  });

  it('returns the stored name when default_key is absent', () => {
    expect(getTagDisplayName({ name: 'Rooftop' })).toBe('Rooftop');
  });

  it('falls back to the stored name for an unrecognised default_key', () => {
    // A key added to the DB but not to VALID_DEFAULT_KEYS must not render a
    // raw i18n path like "defaultTags.museum" to the user.
    expect(getTagDisplayName({ name: 'Museum', default_key: 'museum' })).toBe('Museum');
  });
});
