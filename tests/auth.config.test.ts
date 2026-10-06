import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';

function requestFor(pathname: string, sessionCartId?: string) {
  return {
    nextUrl: { pathname },
    url: `http://localhost:3000${pathname}`,
    headers: new Headers(),
    cookies: {
      get: (name: string) =>
        name === 'sessionCartId' && sessionCartId
          ? { name, value: sessionCartId }
          : undefined,
    },
  };
}

const authorized = authConfig.callbacks.authorized as (args: {
  request: ReturnType<typeof requestFor>;
  auth: { user: { id: string } } | null;
}) => boolean | Response;

describe('authConfig.authorized', () => {
  const protectedPaths = [
    '/shipping-address',
    '/payment-method',
    '/place-order',
    '/profile',
    '/user/orders',
    '/order/order-1',
    '/admin',
    '/admin/products',
  ];

  it.each(protectedPaths)(
    'blocks unauthenticated access to %s',
    (pathname) => {
      expect(
        authorized({ request: requestFor(pathname, 'session-1'), auth: null })
      ).toBe(false);
    }
  );

  it('allows public pages when the session cart cookie already exists', () => {
    expect(
      authorized({
        request: requestFor('/search', 'session-1'),
        auth: null,
      })
    ).toBe(true);
    expect(
      authorized({
        request: requestFor('/', 'session-1'),
        auth: { user: { id: 'user-1' } },
      })
    ).toBe(true);
  });

  it('allows an authenticated user through a protected page that already has a cart cookie', () => {
    expect(
      authorized({
        request: requestFor('/admin/orders', 'session-1'),
        auth: { user: { id: 'user-1' } },
      })
    ).toBe(true);
  });

  it('sets a session cart cookie when one is missing', () => {
    const response = authorized({
      request: requestFor('/search'),
      auth: null,
    });

    expect(response).toBeInstanceOf(NextResponse);
    const cookie = (response as NextResponse).cookies.get('sessionCartId');
    expect(cookie?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('sets a session cart cookie for an authenticated user who does not have one yet', () => {
    const response = authorized({
      request: requestFor('/place-order'),
      auth: { user: { id: 'user-1' } },
    });

    expect(response).toBeInstanceOf(NextResponse);
    expect((response as NextResponse).cookies.get('sessionCartId')?.value).toBeTruthy();
  });
});
