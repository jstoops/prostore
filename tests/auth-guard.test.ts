jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-guard';

describe('requireAdmin', () => {
  it('returns the session for an admin', async () => {
    const session = { user: { id: 'user-1', role: 'admin' } };
    (auth as jest.Mock).mockResolvedValue(session);

    await expect(requireAdmin()).resolves.toBe(session);
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([null, { user: { id: 'user-1', role: 'user' } }, { user: { role: 'Admin' } }])(
    'redirects non-admins to /unauthorized',
    async (session) => {
      (auth as jest.Mock).mockResolvedValue(session);

      await expect(requireAdmin()).rejects.toThrow('REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/unauthorized');
    }
  );
});
