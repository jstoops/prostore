const ENV_KEYS = [
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_APP_DESCRIPTION',
  'NEXT_PUBLIC_SERVER_URL',
  'LATEST_PRODUCTS_LIMIT',
  'PAYMENT_METHODS',
  'DEFAULT_PAYMENT_METHOD',
  'PAGE_SIZE',
  'USER_ROLES',
  'SENDER_EMAIL',
] as const;

const originalEnv = { ...process.env };

async function loadConstants() {
  jest.resetModules();
  return import('@/lib/constants');
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('constants', () => {
  it('uses built-in defaults when environment variables are missing', async () => {
    for (const key of ENV_KEYS) delete process.env[key];

    const constants = await loadConstants();

    expect(constants.APP_NAME).toBe('Prostore');
    expect(constants.APP_DESCRIPTION).toBe('A modern store built with Next.js');
    expect(constants.SERVER_URL).toBe('http://localhost:3000');
    expect(constants.LATEST_PRODUCTS_LIMIT).toBe(4);
    expect(constants.PAGE_SIZE).toBe(12);
    expect(constants.PAYMENT_METHODS).toEqual(['PayPal', 'Stripe', 'CashOnDelivery']);
    expect(constants.DEFAULT_PAYMENT_METHOD).toBe('PayPal');
    expect(constants.USER_ROLES).toEqual(['user', 'admin']);
    expect(constants.SENDER_EMAIL).toBe('onboarding@resend.dev');
    expect(constants.signInDefaultValues).toEqual({
      email: 'admin@example.com',
      password: '123456',
    });
    expect(constants.signUpDefaultValues).toEqual({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
    expect(constants.shippingAddressDefaultValues).toEqual({
      fullName: '',
      streetAddress: '',
      city: '',
      postalCode: '',
      country: '',
    });
    expect(constants.productDefaultValues).toMatchObject({
      name: '',
      price: '0',
      stock: 0,
      isFeatured: false,
      banner: null,
    });
    expect(constants.reviewFormDefaultValues).toEqual({
      title: '',
      comment: '',
      rating: 0,
    });
  });

  it('treats blank and zero numeric settings as the defaults', async () => {
    process.env.LATEST_PRODUCTS_LIMIT = '0';
    process.env.PAGE_SIZE = '';

    const constants = await loadConstants();

    expect(constants.LATEST_PRODUCTS_LIMIT).toBe(4);
    expect(constants.PAGE_SIZE).toBe(12);
  });

  it('reads overrides from the environment', async () => {
    process.env.NEXT_PUBLIC_APP_NAME = 'Shop';
    process.env.NEXT_PUBLIC_APP_DESCRIPTION = 'Custom store';
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://shop.example';
    process.env.LATEST_PRODUCTS_LIMIT = '6';
    process.env.PAGE_SIZE = '24';
    process.env.PAYMENT_METHODS = 'PayPal, Stripe';
    process.env.DEFAULT_PAYMENT_METHOD = 'Stripe';
    process.env.USER_ROLES = 'admin, user';
    process.env.SENDER_EMAIL = 'orders@example.com';

    const constants = await loadConstants();

    expect(constants.APP_NAME).toBe('Shop');
    expect(constants.APP_DESCRIPTION).toBe('Custom store');
    expect(constants.SERVER_URL).toBe('https://shop.example');
    expect(constants.LATEST_PRODUCTS_LIMIT).toBe(6);
    expect(constants.PAGE_SIZE).toBe(24);
    expect(constants.PAYMENT_METHODS).toEqual(['PayPal', 'Stripe']);
    expect(constants.DEFAULT_PAYMENT_METHOD).toBe('Stripe');
    expect(constants.USER_ROLES).toEqual(['admin', 'user']);
    expect(constants.SENDER_EMAIL).toBe('orders@example.com');
  });

  it('falls back when a numeric setting is not a number', async () => {
    process.env.LATEST_PRODUCTS_LIMIT = 'many';
    process.env.PAGE_SIZE = 'lots';

    const constants = await loadConstants();

    expect(constants.LATEST_PRODUCTS_LIMIT).toBe(4);
    expect(constants.PAGE_SIZE).toBe(12);
  });
});
