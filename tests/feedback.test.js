const { _internals } = require('../src/controllers/feedbackController');

describe('feedback page i18n', () => {
  const en = require('../locales/en.json');
  const fr = require('../locales/fr.json');

  test('both locale files have exactly 5 questions and the same keys', () => {
    expect(en.questions).toHaveLength(5);
    expect(fr.questions).toHaveLength(5);
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });

  test('unsupported or odd lang values fall back to English', () => {
    expect(_internals.resolveLang('de')).toBe('en');
    expect(_internals.resolveLang(undefined)).toBe('en');
    expect(_internals.resolveLang(['fr', 'en'])).toBe('en');
    expect(_internals.resolveLang('FR')).toBe('fr');
  });

  test('date is formatted for the active locale', () => {
    const d = new Date(2026, 7, 10);
    expect(_internals.formatToday('en', d)).toMatch(/August/);
    expect(_internals.formatToday('fr', d)).toMatch(/août/);
  });

  test('rendered page contains 5 textareas and escapes HTML', () => {
    const html = _internals.renderPage('en', { ...en, title: '<b>x</b>' });
    expect((html.match(/<textarea/g) || [])).toHaveLength(5);
    expect(html).not.toContain('<b>x</b>');
  });
});
