jest.mock('resend', () => {
  const send = jest.fn();
  (globalThis as { __resendSend?: jest.Mock }).__resendSend = send;
  return {
    Resend: jest.fn().mockImplementation(() => ({
      emails: { send },
    })),
  };
});

jest.mock('@/email/purchase.receipt', () => ({
  __esModule: true,
  default: function PurchaseReceiptEmail() {
    return null;
  },
}));

import { sendPurchaseReceipt } from '@/email';

const send = () =>
  (globalThis as unknown as { __resendSend: jest.Mock }).__resendSend;

describe('sendPurchaseReceipt', () => {
  it('sends an order confirmation to the buyer', async () => {
    send().mockResolvedValue({ id: 'email-1' });

    await sendPurchaseReceipt({
      order: {
        id: 'order-1',
        user: { name: 'Jane', email: 'buyer@example.com' },
      } as Parameters<typeof sendPurchaseReceipt>[0]['order'],
    });

    expect(send()).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Prostore <onboarding@resend.dev>',
        to: 'buyer@example.com',
        subject: 'Order Confirmation order-1',
        react: expect.anything(),
      })
    );
  });
});
