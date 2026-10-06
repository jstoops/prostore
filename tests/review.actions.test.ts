jest.mock('@/db/prisma', () => ({
  prisma: {
    product: { findFirst: jest.fn(), update: jest.fn() },
    review: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import {
  createUpdateReview,
  getReviewByProductId,
  getReviews,
} from '@/lib/actions/review.actions';
import { revalidatePath } from 'next/cache';

const reviewInput = {
  title: 'Great fit',
  description: 'True to size and soft',
  productId: 'prod-1',
  userId: 'someone-else',
  rating: 5,
};

function mockTransaction() {
  const tx = {
    review: {
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }),
      count: jest.fn().mockResolvedValue(2),
    },
    product: { update: jest.fn().mockResolvedValue({}) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (client: typeof tx) => unknown) =>
    fn(tx)
  );
  return tx;
}

describe('createUpdateReview', () => {
  beforeEach(() => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (prisma.product.findFirst as jest.Mock).mockResolvedValue({
      id: 'prod-1',
      slug: 'polo-shirt',
    });
  });

  it('requires an authenticated user', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    await expect(createUpdateReview(reviewInput)).resolves.toEqual({
      success: false,
      message: 'User is not authenticated',
    });
  });

  it('returns validation errors', async () => {
    await expect(createUpdateReview({ ...reviewInput, rating: 0 })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Rating must be at least 1'),
    });
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('reports a missing product', async () => {
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(createUpdateReview(reviewInput)).resolves.toEqual({
      success: false,
      message: 'Product not found',
    });
  });

  it('creates a review for the signed-in user and refreshes the product rating', async () => {
    (prisma.review.findFirst as jest.Mock).mockResolvedValue(null);
    const tx = mockTransaction();

    await expect(createUpdateReview(reviewInput)).resolves.toEqual({
      success: true,
      message: 'Review Updated Successfully',
    });

    expect(tx.review.create).toHaveBeenCalledWith({
      data: { ...reviewInput, userId: 'user-1' },
    });
    expect(tx.review.update).not.toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { rating: 4.5, numReviews: 2 },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/product/polo-shirt');
  });

  it('updates an existing review and stores a zero rating when none can be averaged', async () => {
    (prisma.review.findFirst as jest.Mock).mockResolvedValue({ id: 'rev-1' });
    const tx = mockTransaction();
    tx.review.aggregate.mockResolvedValue({ _avg: { rating: null } });

    await expect(createUpdateReview(reviewInput)).resolves.toMatchObject({ success: true });

    expect(tx.review.update).toHaveBeenCalledWith({
      where: { id: 'rev-1' },
      data: {
        title: reviewInput.title,
        description: reviewInput.description,
        rating: reviewInput.rating,
      },
    });
    expect(tx.review.create).not.toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { rating: 0, numReviews: 2 },
    });
  });
});

describe('review queries', () => {
  it('lists reviews for a product with the author name', async () => {
    const reviews = [{ id: 'rev-1', user: { name: 'Jane' } }];
    (prisma.review.findMany as jest.Mock).mockResolvedValue(reviews);

    await expect(getReviews({ productId: 'prod-1' })).resolves.toEqual({ data: reviews });
    expect(prisma.review.findMany).toHaveBeenCalledWith({
      where: { productId: 'prod-1' },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns the current user review and requires a session', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (prisma.review.findFirst as jest.Mock).mockResolvedValue({ id: 'rev-1' });

    await expect(getReviewByProductId({ productId: 'prod-1' })).resolves.toEqual({
      id: 'rev-1',
    });
    expect(prisma.review.findFirst).toHaveBeenCalledWith({
      where: { productId: 'prod-1', userId: 'user-1' },
    });

    (auth as jest.Mock).mockResolvedValue(null);
    await expect(getReviewByProductId({ productId: 'prod-1' })).rejects.toThrow(
      'User is not authenticated'
    );
  });
});
