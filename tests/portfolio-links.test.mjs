import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLanguage, portfolioUrl, readPortfolioRoute } from '../lib/portfolio-links.mjs';

const base = 'https://portfolio.example/';
const categories = ['youtube', 'vertical', 'custom-category'];
const projects = [{ id: 'stable-id', title: 'Renamed video', category: 'youtube', visible: true }, { id: 'hidden-id', category: 'vertical', visible: false }];

test('explicit language, manual preference, and ordered browser languages have predictable priority', () => {
  assert.equal(chooseLanguage(base, null, ['en-US', 'es-EC']), 'en');
  assert.equal(chooseLanguage(base, null, ['es-EC', 'en-US']), 'es');
  assert.equal(chooseLanguage(base, null, ['fr-FR', 'en-GB']), 'en');
  assert.equal(chooseLanguage(base, 'es', ['en-US']), 'es');
  assert.equal(chooseLanguage(base + '?lang=en', 'es', ['es-EC']), 'en');
  assert.equal(chooseLanguage(base + '?lang=invalid', 'invalid', ['fr-FR']), 'es');
});

test('shared links remove admin paths, draft previews and unrelated query data', () => {
  assert.equal(portfolioUrl(base + 'admin/?preview=draft&token=private', { category: 'youtube' }), base + '?category=youtube#portfolio');
  assert.equal(portfolioUrl(base + '?preview=draft', { video: 'stable-id', language: 'en' }), base + '?lang=en&video=stable-id#portfolio');
  assert.equal(portfolioUrl(base, { language: 'auto' }), base + '#portfolio');
});

test('category links work with newly created categories and survive renaming', () => {
  const route = readPortfolioRoute(portfolioUrl(base, { category: 'custom-category' }), categories, projects);
  assert.equal(route.category, 'custom-category');
  assert.equal(route.portfolio, true);
  assert.equal(route.video, null);
});

test('video links open their current category and survive titles and category changes', () => {
  const href = portfolioUrl(base, { video: 'stable-id' });
  assert.deepEqual(readPortfolioRoute(href, categories, projects), { category: 'youtube', video: 'stable-id', unavailable: false, portfolio: true });
  assert.equal(readPortfolioRoute(href, categories, [{ ...projects[0], category: 'vertical' }]).category, 'vertical');
  assert.equal(readPortfolioRoute(base + '?category=vertical&video=stable-id', categories, projects).category, 'youtube');
  assert.equal(readPortfolioRoute(base + '?category=all&video=stable-id', categories, projects).category, 'all');
});

test('hidden, deleted, malformed and unknown videos never open a different project', () => {
  for (const id of ['hidden-id', 'removed-id', '"]<script>alert(1)</script>']) {
    const route = readPortfolioRoute(portfolioUrl(base, { video: id }), categories, projects);
    assert.equal(route.video, null); assert.equal(route.unavailable, true);
  }
  assert.equal(readPortfolioRoute(base + '?category=deleted', categories, projects).category, 'all');
  assert.equal(readPortfolioRoute(base, categories, projects).portfolio, false);
});
