import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertViteApiEndpointForBuild } from './vite-require-api-endpoint.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

test('skips vite serve', () => {
  assertViteApiEndpointForBuild({ command: 'serve', mode: 'development', root });
});

test('throws on build without VITE_API_ENDPOINT', () => {
  const prev = process.env.VITE_API_ENDPOINT;
  delete process.env.VITE_API_ENDPOINT;
  try {
    assert.throws(
      () => assertViteApiEndpointForBuild({ command: 'build', mode: 'production', root: '/nonexistent-app' }),
      /VITE_API_ENDPOINT is required/
    );
  } finally {
    if (prev !== undefined) process.env.VITE_API_ENDPOINT = prev;
  }
});
