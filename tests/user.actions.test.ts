jest.mock('@/db/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    cart: { delete: jest.fn() },
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('@/lib/actions/cart.actions', () => ({
  getMyCart: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: jest.fn(() => false),
}));

jest.mock('bcrypt-ts-edge', () => ({
  hashSync: jest.fn((password: string) => `hashed:${password}`),
}));

import { hashSync } from 'bcrypt-ts-edge';
import { auth, signIn, signOut } from '@/auth';
import { prisma } from '@/db/prisma';
import { getMyCart } from '@/lib/actions/cart.actions';
import {
  deleteUser,
  getAllUsers,
  getUserById,
  signInWithCredentials,
  signOutUser,
  signUpUser,
  updateProfile,
  updateUser,
  updateUserPaymentMethod,
  updaterUserAddress,
} from '@/lib/actions/user.actions';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { revalidatePath } from 'next/cache';
import { address } from './fixtures';

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const credentials = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'secret1',
  confirmPassword: 'secret1',
};

describe('sign in and sign up', () => {
  beforeEach(() => {
    (isRedirectError as unknown as jest.Mock).mockReturnValue(false);
    (signIn as jest.Mock).mockResolvedValue(undefined);
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'user-1' });
  });

  it('signs in with parsed credentials', async () => {
    await expect(
      signInWithCredentials(
        null,
        formData({ email: 'admin@example.com', password: '123456' })
      )
    ).resolves.toEqual({ success: true, message: 'Signed in successfully' });

    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'admin@example.com',
      password: '123456',
    });
  });

  it('hides credential failures behind one message', async () => {
    await expect(
      signInWithCredentials(null, formData({ email: 'bad', password: '123456' }))
    ).resolves.toEqual({ success: false, message: 'Invalid email or password' });

    (signIn as jest.Mock).mockRejectedValue(new Error('CredentialsSignin'));
    await expect(
      signInWithCredentials(
        null,
        formData({ email: 'admin@example.com', password: '123456' })
      )
    ).resolves.toEqual({ success: false, message: 'Invalid email or password' });
  });

  it('re-throws Next.js redirects from sign in and sign up', async () => {
    const redirectError = new Error('NEXT_REDIRECT');
    (isRedirectError as unknown as jest.Mock).mockReturnValue(true);
    (signIn as jest.Mock).mockRejectedValue(redirectError);

    await expect(
      signInWithCredentials(
        null,
        formData({ email: 'admin@example.com', password: '123456' })
      )
    ).rejects.toBe(redirectError);

    await expect(signUpUser(null, formData(credentials))).rejects.toBe(redirectError);
  });

  it('registers a user with a hashed password and signs them in', async () => {
    await expect(signUpUser(null, formData(credentials))).resolves.toEqual({
      success: true,
      message: 'User registered successfully',
    });

    const created = (prisma.user.create as jest.Mock).mock.calls[0][0].data;
    expect(hashSync).toHaveBeenCalledWith('secret1', 10);
    expect(created.name).toBe('Jane Doe');
    expect(created.email).toBe('jane@example.com');
    expect(created.password).toBe('hashed:secret1');
    expect(created.confirmPassword).toBeUndefined();
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'jane@example.com',
      password: 'secret1',
    });
  });

  it('returns validation and unique-constraint errors from sign up', async () => {
    const mismatch = await signUpUser(
      null,
      formData({ ...credentials, confirmPassword: 'other1' })
    );
    expect(mismatch).toMatchObject({
      success: false,
      message: expect.stringContaining("Passwords don't match"),
    });

    (prisma.user.create as jest.Mock).mockRejectedValue({
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
      message: 'Unique constraint failed',
    });
    await expect(signUpUser(null, formData(credentials))).resolves.toEqual({
      success: false,
      message: 'Email already exists',
    });
  });
});

describe('signOutUser', () => {
  beforeEach(() => {
    (signOut as jest.Mock).mockResolvedValue(undefined);
    (prisma.cart.delete as jest.Mock).mockResolvedValue({});
  });

  it('deletes the current cart before signing out', async () => {
    (getMyCart as jest.Mock).mockResolvedValue({ id: 'cart-1' });

    await signOutUser();

    expect(prisma.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
    expect(signOut).toHaveBeenCalled();
  });

  it('warns and still signs out when there is no cart', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (getMyCart as jest.Mock).mockResolvedValue(undefined);

    await signOutUser();

    expect(prisma.cart.delete).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('No cart found for deletion.');
    expect(signOut).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not sign out when loading the cart fails', async () => {
    (getMyCart as jest.Mock).mockRejectedValue(new Error('Cart session not found'));
    await expect(signOutUser()).rejects.toThrow('Cart session not found');
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('user profile and admin updates', () => {
  beforeEach(() => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1' });
    (prisma.user.update as jest.Mock).mockResolvedValue({});
  });

  it('gets a user by id', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1', name: 'Jane' });
    await expect(getUserById('user-1')).resolves.toMatchObject({ name: 'Jane' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'user-1' } });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(getUserById('missing')).rejects.toThrow('User not found');
  });

  it('updates the shipping address for the current user', async () => {
    await expect(updaterUserAddress(address)).resolves.toEqual({
      success: true,
      message: 'User updated successfully',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { address },
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(updaterUserAddress(address)).resolves.toEqual({
      success: false,
      message: 'User not found',
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-1' });
    await expect(updaterUserAddress({ ...address, city: 'A' })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('City must be at least 3 characters'),
    });
  });

  it('updates the payment method and rejects unknown methods', async () => {
    await expect(updateUserPaymentMethod({ type: 'Stripe' })).resolves.toEqual({
      success: true,
      message: 'User updated successfully',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { paymentMethod: 'Stripe' },
    });

    await expect(updateUserPaymentMethod({ type: 'Bitcoin' })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Invalid payment method'),
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(updateUserPaymentMethod({ type: 'PayPal' })).resolves.toEqual({
      success: false,
      message: 'User not found',
    });
  });

  it('updates only the profile name', async () => {
    await expect(
      updateProfile({ name: 'Janet', email: 'janet@example.com' })
    ).resolves.toEqual({ success: true, message: 'User updated successfully' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Janet' },
    });

    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(updateProfile({ name: 'Janet', email: 'janet@example.com' })).resolves.toEqual(
      { success: false, message: 'User not found' }
    );
  });

  it('lists, deletes, and updates users', async () => {
    (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1' }]);
    (prisma.user.count as jest.Mock).mockResolvedValue(13);

    await expect(getAllUsers({ page: 2, query: 'Jane', limit: 10 })).resolves.toEqual({
      data: [{ id: 'user-1' }],
      totalPages: 2,
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { name: { contains: 'Jane', mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 10,
    });

    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    await getAllUsers({ page: 1, query: 'all' });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 12, skip: 0 })
    );

    (prisma.user.delete as jest.Mock).mockResolvedValue({});
    await expect(deleteUser('user-1')).resolves.toEqual({
      success: true,
      message: 'User deleted successfully',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users');

    (prisma.user.delete as jest.Mock).mockRejectedValue(new Error('cannot delete'));
    await expect(deleteUser('user-1')).resolves.toEqual({
      success: false,
      message: 'cannot delete',
    });

    (prisma.user.update as jest.Mock).mockResolvedValue({});
    await expect(
      updateUser({
        id: 'user-1',
        name: 'Jane',
        email: 'jane@example.com',
        role: 'admin',
      })
    ).resolves.toEqual({ success: true, message: 'User updated successfully' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Jane', role: 'admin' },
    });

    (prisma.user.update as jest.Mock).mockRejectedValue(new Error('update failed'));
    await expect(
      updateUser({
        id: 'user-1',
        name: 'Jane',
        email: 'jane@example.com',
        role: 'admin',
      })
    ).resolves.toEqual({ success: false, message: 'update failed' });
  });
});
