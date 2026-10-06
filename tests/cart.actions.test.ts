jest.mock('@/db/prisma', () => ({
  prisma: {
    product: { findFirst: jest.fn() },
    cart: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import calcPrice, {
  addItemToCart,
  getMyCart,
  removeItemFromCart,
} from '@/lib/actions/cart.actions';
import { cartItem, productRecord } from './fixtures';

function mockSessionCookie(sessionCartId = 'session-1') {
  (cookies as jest.Mock).mockResolvedValue({
    get: (name: string) =>
      name === 'sessionCartId' && sessionCartId ? { value: sessionCartId } : undefined,
  });
}

describe('calcPrice', () => {
  it('charges shipping below or at $100 and tax of 15%', () => {
    expect(calcPrice([])).toEqual({
      itemsPrice: '0.00',
      shippingPrice: '10.00',
      taxPrice: '0.00',
      totalPrice: '10.00',
    });

    expect(calcPrice([cartItem({ price: '33.33', qty: 1 })])).toEqual({
      itemsPrice: '33.33',
      shippingPrice: '10.00',
      taxPrice: '5.00',
      totalPrice: '48.33',
    });

    expect(calcPrice([cartItem({ price: '100.00', qty: 1 })])).toMatchObject({
      itemsPrice: '100.00',
      shippingPrice: '10.00',
      taxPrice: '15.00',
      totalPrice: '125.00',
    });
  });

  it('drops shipping once the items total is over $100', () => {
    expect(
      calcPrice([
        cartItem({ price: '40.00', qty: 1 }),
        cartItem({ productId: 'prod-2', price: '70.00', qty: 1 }),
      ])
    ).toEqual({
      itemsPrice: '110.00',
      shippingPrice: '0.00',
      taxPrice: '16.50',
      totalPrice: '126.50',
    });
  });
});

describe('getMyCart', () => {
  beforeEach(() => {
    mockSessionCookie();
    (auth as jest.Mock).mockResolvedValue(null);
  });

  it('requires a session cart cookie', async () => {
    mockSessionCookie('');
    await expect(getMyCart()).rejects.toThrow('Cart session not found');
  });

  it('loads a guest cart by session id', async () => {
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(getMyCart()).resolves.toBeUndefined();
    expect(prisma.cart.findFirst).toHaveBeenCalledWith({
      where: { sessionCartId: 'session-1' },
    });
  });

  it('loads a signed-in cart by user id and returns plain prices', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue({
      id: 'cart-1',
      items: [cartItem()],
      itemsPrice: { toString: () => '59.99' },
      shippingPrice: { toString: () => '10.00' },
      taxPrice: { toString: () => '9.00' },
      totalPrice: { toString: () => '78.99' },
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    await expect(getMyCart()).resolves.toMatchObject({
      id: 'cart-1',
      items: [cartItem()],
      itemsPrice: '59.99',
      shippingPrice: '10.00',
      taxPrice: '9.00',
      totalPrice: '78.99',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(prisma.cart.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });
});

describe('addItemToCart', () => {
  beforeEach(() => {
    mockSessionCookie();
    (auth as jest.Mock).mockResolvedValue(null);
    (prisma.cart.create as jest.Mock).mockResolvedValue({});
    (prisma.cart.update as jest.Mock).mockResolvedValue({});
  });

  it('reports a missing cart session', async () => {
    mockSessionCookie('');
    await expect(addItemToCart(cartItem())).resolves.toEqual({
      success: false,
      message: 'Cart session not found',
    });
  });

  it('reports an invalid item', async () => {
    const result = await addItemToCart(cartItem({ qty: -1 }));
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Quantity/);
  });

  it('reports a missing product', async () => {
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(addItemToCart(cartItem())).resolves.toEqual({
      success: false,
      message: 'Product not found',
    });
  });

  it('creates a cart for a guest', async () => {
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());

    await expect(addItemToCart(cartItem())).resolves.toEqual({
      success: true,
      message: 'Polo Shirt added to cart',
    });

    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionCartId: 'session-1',
        items: [cartItem()],
        ...calcPrice([cartItem()]),
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/product/$(product.slug)');
  });

  it('creates a cart attached to the signed-in user', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());

    await addItemToCart(cartItem());

    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', sessionCartId: 'session-1' }),
    });
  });

  it('increments quantity when the item is already in the cart and stock allows it', async () => {
    const existing = {
      id: 'cart-1',
      items: [cartItem({ qty: 1 })],
      itemsPrice: '59.99',
      shippingPrice: '10.00',
      taxPrice: '9.00',
      totalPrice: '78.99',
    };
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(existing);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord({ stock: 2 }));

    await expect(addItemToCart(cartItem())).resolves.toEqual({
      success: true,
      message: 'Polo Shirt updated in cart',
    });

    const updatedItems = [cartItem({ qty: 2 })];
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: expect.objectContaining({
        items: updatedItems,
        ...calcPrice(updatedItems),
      }),
    });
  });

  it('refuses to increment past available stock', async () => {
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue({
      id: 'cart-1',
      items: [cartItem({ qty: 1 })],
      itemsPrice: '59.99',
      shippingPrice: '10.00',
      taxPrice: '9.00',
      totalPrice: '78.99',
    });
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord({ stock: 1 }));

    await expect(addItemToCart(cartItem())).resolves.toEqual({
      success: false,
      message: 'Not enough stock',
    });
    expect(prisma.cart.update).not.toHaveBeenCalled();
  });

  it('adds a new line when stock is available and rejects an out-of-stock product', async () => {
    const existing = {
      id: 'cart-1',
      items: [cartItem()],
      itemsPrice: '59.99',
      shippingPrice: '10.00',
      taxPrice: '9.00',
      totalPrice: '78.99',
    };
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(existing);
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(
      productRecord({ id: 'prod-2', name: 'Hat', stock: 0 })
    );

    await expect(
      addItemToCart(cartItem({ productId: 'prod-2', name: 'Hat' }))
    ).resolves.toEqual({ success: false, message: 'Not enough stock' });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(
      productRecord({ id: 'prod-2', name: 'Hat', stock: 1 })
    );
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue({
      ...existing,
      items: [cartItem()],
    });

    await expect(
      addItemToCart(cartItem({ productId: 'prod-2', name: 'Hat' }))
    ).resolves.toEqual({ success: true, message: 'Hat added to cart' });

    const items = [cartItem(), cartItem({ productId: 'prod-2', name: 'Hat' })];
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: expect.objectContaining({ items, ...calcPrice(items) }),
    });
  });
});

describe('removeItemFromCart', () => {
  const storedCart = () => ({
    id: 'cart-1',
    items: [cartItem({ qty: 2 })],
    itemsPrice: '119.98',
    shippingPrice: '0.00',
    taxPrice: '18.00',
    totalPrice: '137.98',
  });

  beforeEach(() => {
    mockSessionCookie();
    (auth as jest.Mock).mockResolvedValue(null);
    (prisma.cart.update as jest.Mock).mockResolvedValue({});
  });

  it('reports a missing cart session, product, cart, or line', async () => {
    mockSessionCookie('');
    await expect(removeItemFromCart('prod-1')).resolves.toEqual({
      success: false,
      message: 'Cart session not found',
    });

    mockSessionCookie();
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(removeItemFromCart('prod-1')).resolves.toEqual({
      success: false,
      message: 'Product not found',
    });

    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(removeItemFromCart('prod-1')).resolves.toEqual({
      success: false,
      message: 'Cart not found',
    });

    (prisma.cart.findFirst as jest.Mock).mockResolvedValue({
      ...storedCart(),
      items: [],
    });
    await expect(removeItemFromCart('prod-1')).resolves.toEqual({
      success: false,
      message: 'Item not found',
    });
  });

  it('decrements quantity when more than one is in the cart', async () => {
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue(storedCart());

    await expect(removeItemFromCart('prod-1')).resolves.toEqual({
      success: true,
      message: 'Polo Shirt was removed from cart',
    });

    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: expect.objectContaining({
        items: [cartItem({ qty: 1 })],
        ...calcPrice([cartItem({ qty: 1 })]),
      }),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/product/$(product.slug)');
  });

  it('removes the line when only one remains', async () => {
    (prisma.product.findFirst as jest.Mock).mockResolvedValue(productRecord());
    (prisma.cart.findFirst as jest.Mock).mockResolvedValue({
      ...storedCart(),
      items: [cartItem({ qty: 1 })],
    });

    await removeItemFromCart('prod-1');

    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: expect.objectContaining({
        items: [],
        ...calcPrice([]),
      }),
    });
  });
});
