import { generateAccessToken, paypal } from '@/lib/paypal';

const originalEnv = {
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_APP_SECRET: process.env.PAYPAL_APP_SECRET,
  PAYPAL_API_URL: process.env.PAYPAL_API_URL,
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

describe('PayPal client', () => {
  const fetchMock = jest.spyOn(global, 'fetch');

  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = 'client-id';
    process.env.PAYPAL_APP_SECRET = 'client-secret';
    delete process.env.PAYPAL_API_URL;
    fetchMock.mockReset();
  });

  afterAll(() => {
    process.env.PAYPAL_CLIENT_ID = originalEnv.PAYPAL_CLIENT_ID;
    process.env.PAYPAL_APP_SECRET = originalEnv.PAYPAL_APP_SECRET;
    process.env.PAYPAL_API_URL = originalEnv.PAYPAL_API_URL;
    fetchMock.mockRestore();
  });

  it('requests an access token with HTTP basic credentials', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'token-1' }));

    await expect(generateAccessToken()).resolves.toBe('token-1');

    const [url, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('grant_type=client_credentials');
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`
    );
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('throws the PayPal error body when token request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse('invalid_client', false));

    await expect(generateAccessToken()).rejects.toThrow('invalid_client');
  });

  it('creates a capture order for the given price', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'ORDER-1', status: 'CREATED' }));

    await expect(paypal.createOrder(10)).resolves.toEqual({
      id: 'ORDER-1',
      status: 'CREATED',
    });

    const [url, init] = fetchMock.mock.calls[1];
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect(init?.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(String(init?.body))).toEqual({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: 'USD',
            value: 10,
          },
        },
      ],
    });
  });

  it('throws when creating an order fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse('ORDER_FAILED', false));

    await expect(paypal.createOrder(10)).rejects.toThrow('ORDER_FAILED');
  });

  it('captures a payment for an order id', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'ORDER-1', status: 'COMPLETED' }));

    await expect(paypal.capturePayment('ORDER-1')).resolves.toEqual({
      id: 'ORDER-1',
      status: 'COMPLETED',
    });

    const [url, init] = fetchMock.mock.calls[1];
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe(
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1/capture'
    );
    expect(init?.method).toBe('POST');
    expect(headers.Authorization).toBe('Bearer token-1');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('throws when capturing a payment fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-1' }))
      .mockResolvedValueOnce(jsonResponse('CAPTURE_FAILED', false));

    await expect(paypal.capturePayment('ORDER-1')).rejects.toThrow('CAPTURE_FAILED');
  });
});
