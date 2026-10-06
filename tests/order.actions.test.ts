jest.mock('@/db/prisma', () => ({
  prisma: {
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: { count: jest.fn() },
    user: { count: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/actions/cart.actions', () => ({
  getMyCart: jest.fn(),
}));

jest.mock('@/lib/actions/user.actions', () => ({
  getUserById: jest.fn(),
}));

jest.mock('@/lib/paypal', () => ({
  paypal: {
    createOrder: jest.fn(),
    capturePayment: jest.fn(),
  },
}));

jest.mock('@/email', () => ({
  sendPurchaseReceipt: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: jest.fn(() => false),
}));

import { auth } from '@/auth';
import { prisma } from '@/db/prisma';
import { sendPurchaseReceipt } from '@/email';
import { getMyCart } from '@/lib/actions/cart.actions';
import {
  approvePayPalOrder,
  createOrder,
  createPayPalOrder,
  deleteOrder,
  deliverOrder,
  getAllOrders,
  getMyOrders,
  getOrderById,
  getOrderSummary,
  updateOrderToPaid,
  updateOrderToPaidCOD,
} from '@/lib/actions/order.actions';
import { paypal } from '@/lib/paypal';
import { getUserById } from '@/lib/actions/user.actions';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { revalidatePath } from 'next/cache';
import { address, cartItem } from './fixtures';

const cart = {
  id: 'cart-1',
  items: [cartItem()],
  itemsPrice: '59.99',
  shippingPrice: '10.00',
  taxPrice: '9.00',
  totalPrice: '78.99',
};

const buyer = {
  id: 'user-1',
  address,
  paymentMethod: 'PayPal',
};

const orderRecord = {
  id: 'order-1',
  isPaid: false,
  isDelivered: false,
  totalPrice: '78.99',
  paymentResult: { id: 'PAY-1', status: '', email_address: '', pricePaid: '0' },
  shippingAddress: address,
  orderitems: [
    { productId: 'prod-1', qty: 2 },
    { productId: 'prod-2', qty: 1 },
  ],
  user: { name: 'Jane', email: 'jane@example.com' },
};

const capture = {
  id: 'PAY-1',
  status: 'COMPLETED',
  payer: { email_address: 'jane@example.com' },
  purchase_units: [{ payments: { captures: [{ amount: { value: '78.99' } }] } }],
};

describe('createOrder', () => {
  beforeEach(() => {
    (isRedirectError as unknown as jest.Mock).mockReturnValue(false);
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (getMyCart as jest.Mock).mockResolvedValue(cart);
    (getUserById as jest.Mock).mockResolvedValue(buyer);
  });

  it('requires a session and a user id', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    await expect(createOrder()).resolves.toEqual({
      success: false,
      message: 'User is not authenticated',
    });

    (auth as jest.Mock).mockResolvedValue({ user: {} });
    await expect(createOrder()).resolves.toEqual({
      success: false,
      message: 'User not found',
    });
  });

  it('sends shoppers back when checkout data is incomplete', async () => {
    (getMyCart as jest.Mock).mockResolvedValue({ ...cart, items: [] });
    await expect(createOrder()).resolves.toEqual({
      success: false,
      message: 'Your cart is empty',
      redirectTo: '/cart',
    });

    (getMyCart as jest.Mock).mockResolvedValue(undefined);
    await expect(createOrder()).resolves.toMatchObject({ redirectTo: '/cart' });

    (getMyCart as jest.Mock).mockResolvedValue(cart);
    (getUserById as jest.Mock).mockResolvedValue({ ...buyer, address: null });
    await expect(createOrder()).resolves.toEqual({
      success: false,
      message: 'No shipping address',
      redirectTo: '/shipping-address',
    });

    (getUserById as jest.Mock).mockResolvedValue({ ...buyer, paymentMethod: '' });
    await expect(createOrder()).resolves.toEqual({
      success: false,
      message: 'No payment method',
      redirectTo: '/payment-method',
    });
  });

  it('creates the order, copies cart lines, and clears the cart', async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: 'order-1' }) },
      orderItem: { create: jest.fn().mockResolvedValue({}) },
      cart: { update: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (client: typeof tx) => unknown) =>
      fn(tx)
    );

    await expect(createOrder()).resolves.toEqual({
      success: true,
      message: 'Order created',
      redirectTo: '/order/order-1',
    });

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        paymentMethod: 'PayPal',
        itemsPrice: '59.99',
        shippingPrice: '10.00',
        taxPrice: '9.00',
        totalPrice: '78.99',
        shippingAddress: address,
      }),
    });
    expect(tx.orderItem.create).toHaveBeenCalledWith({
      data: { ...cartItem(), price: '59.99', orderId: 'order-1' },
    });
    expect(tx.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: {
        items: [],
        totalPrice: 0,
        taxPrice: 0,
        shippingPrice: 0,
        itemsPrice: 0,
      },
    });
  });

  it('reports when the transaction does not return an order and rethrows redirects', async () => {
    (prisma.$transaction as jest.Mock).mockResolvedValue(undefined);
    await expect(createOrder()).resolves.toEqual({
      success: false,
      message: 'Order not created',
    });

    const redirectError = new Error('NEXT_REDIRECT');
    (isRedirectError as unknown as jest.Mock).mockReturnValue(true);
    (getUserById as jest.Mock).mockRejectedValue(redirectError);
    await expect(createOrder()).rejects.toBe(redirectError);

    (isRedirectError as unknown as jest.Mock).mockReturnValue(false);
    (getUserById as jest.Mock).mockResolvedValue({ ...buyer, paymentMethod: 'Bitcoin' });
    await expect(createOrder()).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Invalid payment method'),
    });
  });
});

describe('PayPal orders', () => {
  it('loads an order with its items and buyer', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(orderRecord);
    await expect(getOrderById('order-1')).resolves.toMatchObject({ id: 'order-1' });
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      include: {
        orderitems: true,
        user: { select: { name: true, email: true } },
      },
    });

    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(getOrderById('missing')).resolves.toBeNull();
  });

  it('creates a PayPal order and stores the id', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(orderRecord);
    (paypal.createOrder as jest.Mock).mockResolvedValue({ id: 'PAY-1' });
    (prisma.order.update as jest.Mock).mockResolvedValue({});

    await expect(createPayPalOrder('order-1')).resolves.toEqual({
      success: true,
      message: 'Item order created successfully',
      data: 'PAY-1',
    });
    expect(paypal.createOrder).toHaveBeenCalledWith(78.99);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        paymentResult: { id: 'PAY-1', email_address: '', status: '', pricePaid: 0 },
      },
    });
  });

  it('reports a missing order or a PayPal failure', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(createPayPalOrder('missing')).resolves.toEqual({
      success: false,
      message: 'Order not found',
    });

    (prisma.order.findFirst as jest.Mock).mockResolvedValue(orderRecord);
    (paypal.createOrder as jest.Mock).mockRejectedValue(new Error('paypal down'));
    await expect(createPayPalOrder('order-1')).resolves.toEqual({
      success: false,
      message: 'paypal down',
    });
  });

  it('captures a completed PayPal payment and marks the order paid', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(orderRecord);
    (paypal.capturePayment as jest.Mock).mockResolvedValue(capture);
    const tx = {
      product: { update: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (client: typeof tx) => unknown) =>
      fn(tx)
    );

    await expect(
      approvePayPalOrder('order-1', { orderID: 'PAY-1' })
    ).resolves.toEqual({ success: true, message: 'Your order has been paid' });

    expect(tx.product.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'prod-1' },
      data: { stock: { increment: -2 } },
    });
    expect(tx.product.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'prod-2' },
      data: { stock: { increment: -1 } },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        isPaid: true,
        paidAt: expect.any(Date),
        paymentResult: {
          id: 'PAY-1',
          status: 'COMPLETED',
          email_address: 'jane@example.com',
          pricePaid: '78.99',
        },
      },
    });
    expect(sendPurchaseReceipt).toHaveBeenCalledWith({
      order: expect.objectContaining({ id: 'order-1' }),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/order/order-1');
  });

  it('rejects captures that do not match the stored PayPal order', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(approvePayPalOrder('missing', { orderID: 'PAY-1' })).resolves.toEqual({
      success: false,
      message: 'Order not found',
    });

    (prisma.order.findFirst as jest.Mock).mockResolvedValue(orderRecord);
    (paypal.capturePayment as jest.Mock).mockResolvedValue({
      ...capture,
      id: 'OTHER',
    });
    await expect(approvePayPalOrder('order-1', { orderID: 'OTHER' })).resolves.toEqual({
      success: false,
      message: 'Error in PayPal payment',
    });

    (paypal.capturePayment as jest.Mock).mockResolvedValue({
      ...capture,
      status: 'PENDING',
    });
    await expect(approvePayPalOrder('order-1', { orderID: 'PAY-1' })).resolves.toEqual({
      success: false,
      message: 'Error in PayPal payment',
    });

    (paypal.capturePayment as jest.Mock).mockResolvedValue(null);
    await expect(approvePayPalOrder('order-1', { orderID: 'PAY-1' })).resolves.toEqual({
      success: false,
      message: 'Error in PayPal payment',
    });
  });
});

describe('updateOrderToPaid', () => {
  it('throws when the order is missing, already paid, or disappears after payment', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(updateOrderToPaid({ orderId: 'missing' })).rejects.toThrow('Order not found');

    (prisma.order.findFirst as jest.Mock).mockResolvedValueOnce({ ...orderRecord, isPaid: true });
    await expect(updateOrderToPaid({ orderId: 'order-1' })).rejects.toThrow(
      'Order is already paid'
    );

    (prisma.order.findFirst as jest.Mock)
      .mockResolvedValueOnce(orderRecord)
      .mockResolvedValueOnce(null);
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (client: {
      product: { update: jest.Mock };
      order: { update: jest.Mock };
    }) => unknown) =>
      fn({
        product: { update: jest.fn() },
        order: { update: jest.fn() },
      })
    );
    await expect(updateOrderToPaid({ orderId: 'order-1' })).rejects.toThrow('Order not found');
    expect(sendPurchaseReceipt).not.toHaveBeenCalled();
  });

  it('marks a cash order paid without a payment result', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(orderRecord);
    const tx = {
      product: { update: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (client: typeof tx) => unknown) =>
      fn(tx)
    );

    await expect(updateOrderToPaidCOD('order-1')).resolves.toEqual({
      success: true,
      message: 'Order marked as paid',
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        isPaid: true,
        paidAt: expect.any(Date),
        paymentResult: undefined,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/order/order-1');

    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(updateOrderToPaidCOD('missing')).resolves.toEqual({
      success: false,
      message: 'Order not found',
    });
  });
});

describe('order queries and fulfillment', () => {
  it('returns the current user orders', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    await expect(getMyOrders({ page: 1 })).rejects.toThrow('User is not authorized');

    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });
    (prisma.order.findMany as jest.Mock).mockResolvedValue([{ id: 'order-1' }]);
    (prisma.order.count as jest.Mock).mockResolvedValue(13);

    await expect(getMyOrders({ page: 2, limit: 10 })).resolves.toEqual({
      data: [{ id: 'order-1' }],
      totalPages: 2,
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 10,
    });
  });

  it('summarizes sales for the admin overview', async () => {
    (prisma.order.count as jest.Mock).mockResolvedValue(4);
    (prisma.product.count as jest.Mock).mockResolvedValue(8);
    (prisma.user.count as jest.Mock).mockResolvedValue(3);
    (prisma.order.aggregate as jest.Mock).mockResolvedValue({ _sum: { totalPrice: 120 } });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { month: '01/24', totalSales: 100 },
      { month: '02/24', totalSales: '20.5' },
    ]);
    (prisma.order.findMany as jest.Mock).mockResolvedValue([{ id: 'order-1' }]);

    await expect(getOrderSummary()).resolves.toEqual({
      ordersCount: 4,
      productsCount: 8,
      usersCount: 3,
      totalSales: { _sum: { totalPrice: 120 } },
      latestSales: [{ id: 'order-1' }],
      salesData: [
        { month: '01/24', totalSales: 100 },
        { month: '02/24', totalSales: 20.5 },
      ],
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
      take: 6,
    });
  });

  it('searches and pages all orders', async () => {
    (prisma.order.findMany as jest.Mock).mockResolvedValue([{ id: 'order-1' }]);
    (prisma.order.count as jest.Mock).mockResolvedValue(5);

    await expect(getAllOrders({ page: 1, query: 'Jane', limit: 2 })).resolves.toEqual({
      data: [{ id: 'order-1' }],
      totalPages: 3,
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { user: { name: { contains: 'Jane', mode: 'insensitive' } } },
      orderBy: { createdAt: 'desc' },
      take: 2,
      skip: 0,
      include: { user: { select: { name: true } } },
    });

    await getAllOrders({ page: 2, query: 'all' });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 12, skip: 12 })
    );
  });

  it('deletes an order', async () => {
    (prisma.order.delete as jest.Mock).mockResolvedValue({});
    await expect(deleteOrder('order-1')).resolves.toEqual({
      success: true,
      message: 'Order deleted successfully',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/orders');

    (prisma.order.delete as jest.Mock).mockRejectedValue(new Error('cannot delete'));
    await expect(deleteOrder('order-1')).resolves.toEqual({
      success: false,
      message: 'cannot delete',
    });
  });

  it('marks a paid order delivered', async () => {
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(deliverOrder('missing')).resolves.toEqual({
      success: false,
      message: 'Order not found',
    });

    (prisma.order.findFirst as jest.Mock).mockResolvedValue({ ...orderRecord, isPaid: false });
    await expect(deliverOrder('order-1')).resolves.toEqual({
      success: false,
      message: 'Order is not paid',
    });

    (prisma.order.findFirst as jest.Mock).mockResolvedValue({ ...orderRecord, isPaid: true });
    (prisma.order.update as jest.Mock).mockResolvedValue({});
    await expect(deliverOrder('order-1')).resolves.toEqual({
      success: true,
      message: 'Order has been marked delivered',
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { isDelivered: true, deliveredAt: expect.any(Date) },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/order/order-1');
  });
});
