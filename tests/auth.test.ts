jest.mock('@/db/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    cart: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn((client: unknown) => {
    (globalThis as unknown as { __prismaAdapterClient?: unknown }).__prismaAdapterClient =
      client;
    return { adapter: true };
  }),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('bcrypt-ts-edge', () => ({
  compareSync: jest.fn(),
}));

jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: (config: unknown) => {
    (globalThis as { __credentialsConfig?: unknown }).__credentialsConfig = config;
    return { id: 'credentials' };
  },
}));

jest.mock('next-auth', () => ({
  __esModule: true,
  default: (config: unknown) => {
    (globalThis as { __nextAuthConfig?: unknown }).__nextAuthConfig = config;
    return {
      handlers: { GET: jest.fn(), POST: jest.fn() },
      auth: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    };
  },
}));

import { compareSync } from 'bcrypt-ts-edge';
import { cookies } from 'next/headers';
import { prisma } from '@/db/prisma';
import '@/auth';

type AuthConfig = {
  pages: { signIn: string; error: string };
  session: { strategy: string; maxAge: number };
  providers: unknown[];
  callbacks: {
    jwt: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    session: (args: Record<string, unknown>) => Promise<{
      user: { id?: string; role?: string; name?: string };
    }>;
  };
};

type CredentialsConfig = {
  authorize: (credentials: Record<string, string> | null) => Promise<unknown>;
};

const authConfig = () =>
  (globalThis as unknown as { __nextAuthConfig: AuthConfig }).__nextAuthConfig;
const credentialsConfig = () =>
  (globalThis as unknown as { __credentialsConfig: CredentialsConfig })
    .__credentialsConfig;

const user = {
  id: 'user-1',
  name: 'Jane',
  email: 'jane@example.com',
  password: 'hashed',
  role: 'user',
};

describe('credentials authorize', () => {
  beforeEach(() => {
    (prisma.user.findFirst as jest.Mock).mockReset();
    (compareSync as jest.Mock).mockReset();
  });

  it('returns null when credentials are missing', async () => {
    await expect(credentialsConfig().authorize(null)).resolves.toBeNull();
  });

  it('returns null when the user does not exist', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      credentialsConfig().authorize({
        email: 'missing@example.com',
        password: 'secret',
      })
    ).resolves.toBeNull();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'missing@example.com' },
    });
  });

  it('returns null when the user has no password or the password does not match', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({
      ...user,
      password: null,
    });
    await expect(
      credentialsConfig().authorize({ email: user.email, password: 'secret' })
    ).resolves.toBeNull();

    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
    (compareSync as jest.Mock).mockReturnValue(false);
    await expect(
      credentialsConfig().authorize({ email: user.email, password: 'wrong' })
    ).resolves.toBeNull();
    expect(compareSync).toHaveBeenCalledWith('wrong', 'hashed');
  });

  it('returns the public user when the password matches', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(user);
    (compareSync as jest.Mock).mockReturnValue(true);

    await expect(
      credentialsConfig().authorize({ email: user.email, password: 'secret' })
    ).resolves.toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  });
});

describe('auth callbacks', () => {
  beforeEach(() => {
    (prisma.user.update as jest.Mock).mockReset();
    (prisma.cart.findFirst as jest.Mock).mockReset();
    (prisma.cart.deleteMany as jest.Mock).mockReset();
    (prisma.cart.update as jest.Mock).mockReset();
    (cookies as jest.Mock).mockReset();
  });

  it('configures the credentials session', () => {
    expect(
      (globalThis as unknown as { __prismaAdapterClient?: unknown }).__prismaAdapterClient
    ).toBe(prisma);
    expect(authConfig().pages).toEqual({ signIn: '/sign-in', error: '/sign-in' });
    expect(authConfig().session).toEqual({
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(authConfig().providers).toHaveLength(1);
  });

  it('copies token fields onto the session and applies profile updates', async () => {
    const session = { user: { name: 'Old' } };

    await expect(
      authConfig().callbacks.session({
        session,
        user: { name: 'Updated' },
        trigger: 'update',
        token: { sub: 'user-1', role: 'admin', name: 'Token Name' },
      })
    ).resolves.toEqual({
      user: { id: 'user-1', role: 'admin', name: 'Updated' },
    });

    await expect(
      authConfig().callbacks.session({
        session: { user: {} },
        user: { name: 'Ignored' },
        trigger: 'signIn',
        token: { sub: 'user-1', role: 'user', name: 'Jane' },
      })
    ).resolves.toEqual({
      user: { id: 'user-1', role: 'user', name: 'Jane' },
    });
  });

  it('names a NO_NAME user from their email and merges the session cart', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: () => ({ value: 'session-1' }),
    });
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue({ id: 'cart-1' });
    (prisma.user.update as jest.Mock).mockResolvedValue({});
    (prisma.cart.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.cart.update as jest.Mock).mockResolvedValue({});

    const token = await authConfig().callbacks.jwt({
      token: { sub: 'user-1' },
      user: {
        id: 'user-1',
        role: 'user',
        name: 'NO_NAME',
        email: 'ada@example.com',
      },
      trigger: 'signUp',
    });

    expect(token).toMatchObject({
      id: 'user-1',
      role: 'user',
      name: 'ada',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'ada' },
    });
    expect(prisma.cart.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: { userId: 'user-1' },
    });
  });

  it('does not merge a cart when the session cookie has no cart', async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: () => ({ value: 'session-1' }),
    });
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);

    const token = await authConfig().callbacks.jwt({
      token: {},
      user: { id: 'user-1', role: 'admin', name: 'Jane', email: 'jane@example.com' },
      trigger: 'signIn',
    });

    expect(token).toMatchObject({ id: 'user-1', role: 'admin' });
    expect(token.name).toBeUndefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.cart.deleteMany).not.toHaveBeenCalled();
    expect(prisma.cart.update).not.toHaveBeenCalled();
  });

  it('skips cart merging when there is no session cart cookie or the trigger is not sign-in', async () => {
    (cookies as jest.Mock).mockResolvedValue({ get: () => undefined });

    await authConfig().callbacks.jwt({
      token: {},
      user: { id: 'user-1', role: 'user', name: 'Jane', email: 'jane@example.com' },
      trigger: 'signIn',
    });
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();

    (cookies as jest.Mock).mockResolvedValue({
      get: () => ({ value: 'session-1' }),
    });
    await authConfig().callbacks.jwt({
      token: { name: 'Jane' },
      user: { id: 'user-1', role: 'user', name: 'Jane', email: 'jane@example.com' },
      trigger: 'update',
    });
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it('returns the token unchanged when there is no user', async () => {
    const token = { sub: 'user-1', name: 'Jane' };
    await expect(authConfig().callbacks.jwt({ token })).resolves.toBe(token);
  });

  it('updates the token name from a session update', async () => {
    await expect(
      authConfig().callbacks.jwt({
        token: { name: 'Old' },
        trigger: 'update',
        session: { user: { name: 'New' } },
      })
    ).resolves.toMatchObject({ name: 'New' });

    await expect(
      authConfig().callbacks.jwt({
        token: { name: 'Old' },
        trigger: 'update',
        session: { user: { name: '' } },
      })
    ).resolves.toMatchObject({ name: 'Old' });
  });
});
