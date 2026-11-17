import assert from 'node:assert/strict';
import test from 'node:test';
import { getAppBasePath, getDefaultXamppApiUrl, resolveProjectUrl } from '../src/lib/mysqlService';

test('API and document URLs work on Vercel deep links and XAMPP subdirectories', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    for (const base of ['', '/tacloban-praise']) {
      const origin = 'https://praise.example.com';
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: { origin, pathname: `${base}/dashboard`, href: `${origin}${base}/dashboard` } },
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { querySelectorAll: () => [{ src: `${origin}${base}/assets/index.js` }] },
      });
      assert.equal(getAppBasePath(), base);
      assert.equal(getDefaultXamppApiUrl(), `${base}/api`);
      assert.equal(resolveProjectUrl('api/documents.php?action=download&id=doc-1'),
        `${origin}${base}/api/documents.php?action=download&id=doc-1`);
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
