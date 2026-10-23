import { expect, it } from 'vitest';
import { createDeploymentConfig } from '../deployment/config';

it('uses the env backend origin while preserving same-origin API requests and SPA routing', () => {
  const config = createDeploymentConfig('https://api.example.com/');
  expect(config.rewrites).toEqual([
    { source: '/api/:path*', destination: 'https://api.example.com/api/:path*' },
    { source: '/(.*)', destination: '/index.html' },
  ]);
  expect(createDeploymentConfig('https://other.example.com').rewrites?.[0]?.destination).toBe(
    'https://other.example.com/api/:path*',
  );
  expect(config.headers?.[0]?.headers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: 'Content-Security-Policy' }),
      expect.objectContaining({ key: 'X-Content-Type-Options', value: 'nosniff' }),
    ]),
  );
});

it.each([
  undefined,
  '',
  '   ',
  'invalid',
  'http://api.example.com',
  'https://localhost',
  'https://user:password@api.example.com',
  'https://api.example.com/api',
  'https://api.example.com?key=value',
  'https://api.example.com/#fragment',
])('rejects a missing or invalid backend origin: %s', (origin) => {
  expect(() => createDeploymentConfig(origin)).toThrow(/BACKEND_URL/);
});
