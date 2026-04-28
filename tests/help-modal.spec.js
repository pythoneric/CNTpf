const { test, expect } = require('@playwright/test');

/**
 * Help modal — README.md inside the app
 *
 * Locks:
 *   1. Header has a Help button (desktop + mobile overflow); click opens
 *      #helpModal.
 *   2. README.md fetches and renders into HTML — headings, lists, tables,
 *      links, code, blockquotes show up as proper elements.
 *   3. When the fetch fails (offline / file missing), a fallback card
 *      appears with a link to the GitHub copy.
 *   4. i18n: button + modal title + fallback strings translate.
 *   5. The renderMarkdown helper handles each markdown block type.
 */

async function loadApp(page) {
  page.on('dialog', d => d.accept());
  await page.goto('/cnt.html');
  await page.waitForFunction(() => typeof window._testLoadData === 'function');
  await page.evaluate(() => {
    const data = window.defaultEditData();
    data.config.tasa = 60;
    data.config.mes = 'Marzo';
    data.config.anio = 2026;
    window._testLoadData(data);
  });
  await page.waitForSelector('#dashApp', { state: 'visible' });
}

// ───────────────────────────────────────────────────────────────────
// 1. Header button — visible + opens the modal
// ───────────────────────────────────────────────────────────────────
test.describe('Header Help button', () => {
  test('Help button is visible in the desktop header', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#helpBtn')).toHaveCount(1);
  });

  test('clicking #helpBtn opens #helpModal', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openHelp());
    await expect(page.locator('#helpModal')).toHaveClass(/open/);
  });

  test('clicking the close button closes the modal', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openHelp());
    await expect(page.locator('#helpModal')).toHaveClass(/open/);
    await page.locator('#helpModal .help-header button').click();
    await expect(page.locator('#helpModal')).not.toHaveClass(/open/);
  });

  test('mobile overflow menu also exposes the Help item', async ({ page }) => {
    await loadApp(page);
    const items = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#hdrOverflowMenu .overflow-item')).map(b => b.getAttribute('data-i18n'))
    );
    expect(items).toContain('help');
  });
});

// ───────────────────────────────────────────────────────────────────
// 2. README renders inside the modal (online path)
// ───────────────────────────────────────────────────────────────────
test.describe('Help modal — README renders', () => {
  test('opens, fetches README.md, and renders the H1 + at least one H2', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openHelp());
    // Wait for the loading text to be replaced
    await page.waitForFunction(() => {
      const c = document.getElementById('helpContent');
      return c && c.querySelector('h1');
    }, null, { timeout: 5000 });
    const h1Text = await page.locator('#helpContent h1').first().textContent();
    expect(h1Text).toMatch(/CNT Core|Personal Finance|Dashboard/i);
    const h2Count = await page.locator('#helpContent h2').count();
    expect(h2Count).toBeGreaterThan(2); // README has plenty of H2s
  });

  test('renders tables, code blocks, and external links from README', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => openHelp());
    await page.waitForFunction(() => document.querySelector('#helpContent table'));
    expect(await page.locator('#helpContent table').count()).toBeGreaterThan(0);
    expect(await page.locator('#helpContent pre code').count()).toBeGreaterThan(0);
    // External links carry target=_blank rel=noopener
    const linkAttrs = await page.evaluate(() => {
      const a = document.querySelector('#helpContent a[href^="http"]');
      return a ? { target: a.target, rel: a.rel } : null;
    });
    if (linkAttrs) {
      expect(linkAttrs.target).toBe('_blank');
      expect(linkAttrs.rel).toContain('noopener');
    }
  });

  test('opening the modal a second time does not refetch (uses cache)', async ({ page }) => {
    await loadApp(page);
    let fetchCount = 0;
    await page.route('**/README.md', async (route) => {
      fetchCount++;
      await route.continue();
    });
    await page.evaluate(() => openHelp());
    await page.waitForFunction(() => document.querySelector('#helpContent h1'));
    await page.evaluate(() => closeHelp());
    await page.evaluate(() => openHelp());
    // Allow a moment in case a second fetch was queued
    await page.waitForTimeout(150);
    expect(fetchCount).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────
// 3. Offline fallback when README.md is unavailable
// ───────────────────────────────────────────────────────────────────
test.describe('Help modal — offline fallback', () => {
  test('shows the GitHub link when README.md fetch fails', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.route('**/README.md', route => route.abort());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.openHelp === 'function');
    await page.evaluate(() => openHelp());
    await page.waitForSelector('#helpContent .help-error', { timeout: 5000 });
    const html = await page.locator('#helpContent .help-error').innerHTML();
    expect(html).toContain('github.com');
    expect(html).toMatch(/cargar|load/i);
  });
});

// ───────────────────────────────────────────────────────────────────
// 4. i18n: Spanish + English copy
// ───────────────────────────────────────────────────────────────────
test.describe('Help modal — i18n', () => {
  test('Spanish: button label and modal title translate', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('es'));
    await page.evaluate(() => openHelp());
    expect(await page.locator('#helpBtn').textContent()).toContain('Ayuda');
    expect(await page.locator('#helpModalTitle').textContent()).toContain('Ayuda');
  });

  test('English: button label and modal title translate', async ({ page }) => {
    await loadApp(page);
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => openHelp());
    expect(await page.locator('#helpBtn').textContent()).toContain('Help');
    expect(await page.locator('#helpModalTitle').textContent()).toContain('Help');
  });

  test('Offline fallback strings translate', async ({ page }) => {
    await page.route('**/README.md', route => route.abort());
    page.on('dialog', d => d.accept());
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof window.openHelp === 'function');
    await page.evaluate(() => window._testSetLang('en'));
    await page.evaluate(() => openHelp());
    await page.waitForSelector('#helpContent .help-error');
    const html = await page.locator('#helpContent .help-error').innerHTML();
    expect(html).toMatch(/Couldn['’]t load/i);
    expect(html).toContain('GitHub');
  });
});

// ───────────────────────────────────────────────────────────────────
// 5. renderMarkdown unit tests
// ───────────────────────────────────────────────────────────────────
test.describe('renderMarkdown — block coverage', () => {
  test('headings 1-4 render as h1-h4', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const html = await page.evaluate(() =>
      renderMarkdown('# Title\n## Section\n### Sub\n#### Subsub')
    );
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<h3>Sub</h3>');
    expect(html).toContain('<h4>Subsub</h4>');
  });

  test('unordered + ordered lists render with correct list type', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const ul = await page.evaluate(() => renderMarkdown('- one\n- two'));
    const ol = await page.evaluate(() => renderMarkdown('1. one\n2. two'));
    expect(ul).toContain('<ul>');
    expect(ul).toContain('<li>one</li>');
    expect(ol).toContain('<ol>');
    expect(ol).toContain('<li>two</li>');
  });

  test('table with header + body row', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const html = await page.evaluate(() =>
      renderMarkdown('| Col1 | Col2 |\n|------|------|\n| a | b |')
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Col1</th>');
    expect(html).toContain('<td>a</td>');
  });

  test('fenced code block preserves content verbatim and HTML-escapes', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const html = await page.evaluate(() =>
      renderMarkdown('```\nconst <x> = 1;\n```')
    );
    expect(html).toContain('<pre><code>');
    expect(html).toContain('const &lt;x&gt; = 1;');
  });

  test('inline code, bold, italic, and links', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const html = await page.evaluate(() =>
      renderMarkdown('text `code` **bold** *italic* [link](https://example.com)')
    );
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener">link</a>');
  });

  test('blockquote and horizontal rule', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const html = await page.evaluate(() =>
      renderMarkdown('> a quote\n\n---\n\nplain')
    );
    expect(html).toContain('<blockquote>a quote</blockquote>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<p>plain</p>');
  });

  test('XSS protection: script tags inside markdown are escaped', async ({ page }) => {
    await page.goto('/cnt.html');
    await page.waitForFunction(() => typeof renderMarkdown === 'function');
    const html = await page.evaluate(() =>
      renderMarkdown('# Hello\n<script>alert(1)</script>\n\nDone.')
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
