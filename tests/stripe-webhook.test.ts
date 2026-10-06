jest.mock('stripe', () => ({
  __esModule: true,
  default: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}));

jest.mock('@/lib/actions/order.actions', () => ({
  updateOrderToPaid: jest.fn(),
}));

import Stripe from 'stripe';
import { updateOrderToPaid } from '@/lib/actions/order.actions';
import { POST } from '@/app/api/webhooks/stripe/route';

function request(signature: string | null = 'sig_test') {
  return {
    text: async () => 'raw-body',
    headers: {
      get: (name: string) => (name === 'stripe-signature' ? signature : null),
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('Stripe webhook', () => {
  const constructEvent = Stripe.webhooks.constructEvent as jest.Mock;

  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    (updateOrderToPaid as jest.Mock).mockResolvedValue(undefined);
  });

  it('marks the order paid when a charge succeeds', async () => {
    constructEvent.mockReturnValue({
      type: 'charge.succeeded',
      data: {
        object: {
          id: 'ch_1',
          amount: 2599,
          metadata: { orderId: 'order-1' },
          billing_details: { email: 'buyer@example.com' },
        },
      },
    });

    const response = await POST(request());

    expect(constructEvent).toHaveBeenCalledWith('raw-body', 'sig_test', 'whsec_test');
    expect(updateOrderToPaid).toHaveBeenCalledWith({
      orderId: 'order-1',
      paymentResult: {
        id: 'ch_1',
        status: 'COMPLETED',
        email_address: 'buyer@example.com',
        pricePaid: '26',
      },
    });
    await expect(response.json()).resolves.toEqual({
      message: 'updateOrderToPaid was successful',
    });
  });

  it('ignores other event types', async () => {
    constructEvent.mockReturnValue({ type: 'payment_intent.created', data: { object: {} } });

    const response = await POST(request(null));

    expect(constructEvent).toHaveBeenCalledWith('raw-body', null, 'whsec_test');
    expect(updateOrderToPaid).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: 'event is not charge.succeeded',
    });
  });
});
