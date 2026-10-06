jest.mock('next-auth', () => ({
  __esModule: true,
  default: (config: unknown) => {
    (globalThis as unknown as { __middlewareAuthConfig?: unknown }).__middlewareAuthConfig =
      config;
    return { auth: jest.fn() };
  },
}));

import { authConfig } from '@/auth.config';
import { middleware } from '@/middleware';

describe('middleware', () => {
  it('wraps authConfig in the NextAuth middleware', () => {
    expect(
      (globalThis as unknown as { __middlewareAuthConfig?: unknown }).__middlewareAuthConfig
    ).toBe(authConfig);
    expect(middleware).toEqual(expect.any(Function));
  });
});
