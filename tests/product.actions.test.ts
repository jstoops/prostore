jest.mock('@/db/prisma', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

import { prisma } from '@/db/prisma';
import { revalidatePath } from 'next/cache';
import {
  createProduct,
  deleteProduct,
  getAllCategories,
  getAllProducts,
  getFeaturedProducts,
  getLatestProducts,
  getProductById,
  getProductBySlug,
  updateProduct,
} from '@/lib/actions/product.actions';
import { productRecord, validProductInput } from './fixtures';

describe('product queries', () => {
  it('returns the latest products as plain objects', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([productRecord()]);

    const products = await getLatestProducts();

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      take: 4,
      orderBy: { createdAt: 'desc' },
    });
    expect(products[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('finds a product by slug or id', async () => {
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());

    await expect(getProductBySlug('polo-shirt')).resolves.toMatchObject({
      slug: 'polo-shirt',
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { slug: 'polo-shirt' },
    });

    const byId = await getProductById('prod-1');
    expect(byId).toMatchObject({ id: 'prod-1' });
    expect(byId?.createdAt).toBe('2024-01-01T00:00:00.000Z');

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(getProductById('missing')).resolves.toBeNull();
  });

  it('filters, sorts, and paginates the catalog', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([productRecord()]);
    (prisma.product.count as jest.Mock).mockResolvedValue(25);

    await expect(
      getAllProducts({
        query: 'polo',
        limit: 10,
        page: 2,
        category: 'Shirts',
        price: '10-50',
        rating: '4',
        sort: 'lowest',
      })
    ).resolves.toEqual({
      data: [productRecord()],
      totalPages: 3,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        name: { contains: 'polo', mode: 'insensitive' },
        category: 'Shirts',
        price: { gte: 10, lte: 50 },
        rating: { gte: 4 },
      },
      orderBy: { price: 'asc' },
      skip: 10,
      take: 10,
    });
  });

  it.each([
    ['highest', { price: 'desc' }],
    ['rating', { rating: 'desc' }],
    ['newest', { createdAt: 'desc' }],
  ] as const)('sorts by %s', async (sort, orderBy) => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.product.count as jest.Mock).mockResolvedValue(0);

    await getAllProducts({ query: 'all', page: 1, sort, category: 'all', price: 'all', rating: 'all' });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy,
        skip: 0,
        take: 12,
      })
    );
    expect(prisma.product.count).toHaveBeenCalledWith();
  });

  it('returns featured products and category counts', async () => {
    (prisma.product.findMany as jest.Mock).mockResolvedValue([
      productRecord({ isFeatured: true }),
    ]);
    await getFeaturedProducts();
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { isFeatured: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });

    const categories = [{ category: 'Shirts', _count: 2 }];
    (prisma.product.groupBy as jest.Mock).mockResolvedValue(categories);
    await expect(getAllCategories()).resolves.toEqual(categories);
    expect(prisma.product.groupBy).toHaveBeenCalledWith({
      by: ['category'],
      _count: true,
    });
  });
});

describe('product mutations', () => {
  it('deletes an existing product and reports a missing one', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(deleteProduct('missing')).resolves.toEqual({
      success: false,
      message: 'Product not found',
    });

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord());
    (prisma.product.delete as jest.Mock).mockResolvedValue({});
    await expect(deleteProduct('prod-1')).resolves.toEqual({
      success: true,
      message: 'Product deleted successfully',
    });
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/products');

    (prisma.product.findUnique as jest.Mock).mockResolvedValue(productRecord());
    (prisma.product.delete as jest.Mock).mockRejectedValue(new Error('still referenced'));
    await expect(deleteProduct('prod-1')).resolves.toEqual({
      success: false,
      message: 'still referenced',
    });
  });

  it('creates a product and returns validation errors', async () => {
    (prisma.product.create as jest.Mock).mockResolvedValue({});

    await expect(createProduct(validProductInput)).resolves.toEqual({
      success: true,
      message: 'Product created successfully',
    });
    expect(prisma.product.create).toHaveBeenCalledWith({ data: validProductInput });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/products');

    await expect(
      createProduct({ ...validProductInput, name: 'No' })
    ).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Name must be at least 3 characters'),
    });
  });

  it('updates an existing product and reports a missing one', async () => {
    const input = { ...validProductInput, id: 'prod-1' };
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(updateProduct(input)).resolves.toEqual({
      success: false,
      message: 'Product not found',
    });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());
    (prisma.product.update as jest.Mock).mockResolvedValue({});
    await expect(updateProduct(input)).resolves.toEqual({
      success: true,
      message: 'Product updated successfully',
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: input,
    });

    await expect(updateProduct({ ...input, id: '' })).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Id is required'),
    });
  });
});
