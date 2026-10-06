import {
  cartItemSchema,
  insertCartSchema,
  insertOrderItemSchema,
  insertOrderSchema,
  insertProductSchema,
  insertReviewSchema,
  paymentMethodSchema,
  paymentResultSchema,
  shippingAddressSchema,
  signInFormSchema,
  signUpFormSchema,
  updateProductSchema,
  updateProfileSchema,
  updateUserSchema,
} from '@/lib/validators';
import { address, cartItem, validProductInput } from './fixtures';

describe('insertProductSchema', () => {
  it('accepts a valid product and coerces stock', () => {
    const parsed = insertProductSchema.parse({
      ...validProductInput,
      stock: '8',
    });

    expect(parsed.stock).toBe(8);
    expect(parsed.price).toBe('59.99');
  });

  it('rejects short text, missing images, and non-currency prices', () => {
    const result = insertProductSchema.safeParse({
      ...validProductInput,
      name: 'Po',
      images: [],
      price: '10.555',
      banner: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          'Name must be at least 3 characters',
          'Product must have at least one image',
          'Price must have exactly two decimal places',
        ])
      );
    }
  });

  it('accepts whole-number prices and nullable banners', () => {
    expect(
      insertProductSchema.parse({ ...validProductInput, price: '10', banner: null })
        .price
    ).toBe('10');
  });
});

describe('updateProductSchema', () => {
  it('requires an id', () => {
    const result = updateProductSchema.safeParse(validProductInput);
    expect(result.success).toBe(false);

    expect(
      updateProductSchema.parse({ ...validProductInput, id: 'prod-1' }).id
    ).toBe('prod-1');
  });
});

describe('sign in and sign up schemas', () => {
  it('validates credentials', () => {
    expect(
      signInFormSchema.parse({ email: 'admin@example.com', password: '123456' })
    ).toEqual({ email: 'admin@example.com', password: '123456' });

    const invalid = signInFormSchema.safeParse({
      email: 'not-an-email',
      password: '123',
    });
    expect(invalid.success).toBe(false);
  });

  it('requires matching passwords on sign up', () => {
    const valid = signUpFormSchema.parse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'secret1',
      confirmPassword: 'secret1',
    });
    expect(valid.name).toBe('Jane Doe');

    const mismatch = signUpFormSchema.safeParse({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'secret1',
      confirmPassword: 'secret2',
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues.map((issue) => issue.message)).toContain(
        "Passwords don't match"
      );
    }
  });
});

describe('cart schemas', () => {
  it('accepts a cart item and a cart', () => {
    const item = cartItem();
    expect(cartItemSchema.parse(item)).toEqual(item);

    expect(
      insertCartSchema.parse({
        items: [item],
        itemsPrice: '59.99',
        shippingPrice: '10.00',
        taxPrice: '9.00',
        totalPrice: '78.99',
        sessionCartId: 'session-1',
        userId: null,
      }).userId
    ).toBeNull();
  });

  it('rejects a negative quantity and a missing session cart id', () => {
    expect(cartItemSchema.safeParse(cartItem({ qty: -1 })).success).toBe(false);
    expect(cartItemSchema.safeParse(cartItem({ qty: 0 })).success).toBe(true);
    expect(
      insertCartSchema.safeParse({
        items: [cartItem()],
        itemsPrice: '59.99',
        shippingPrice: '10.00',
        taxPrice: '9.00',
        totalPrice: '78.99',
        sessionCartId: '',
      }).success
    ).toBe(false);
  });
});

describe('shipping and payment schemas', () => {
  it('accepts a shipping address and optional coordinates', () => {
    expect(shippingAddressSchema.parse({ ...address, lat: 30.2, lng: -97.7 })).toMatchObject(
      address
    );
    expect(shippingAddressSchema.safeParse({ ...address, city: 'A' }).success).toBe(
      false
    );
  });

  it('only allows configured payment methods', () => {
    expect(paymentMethodSchema.parse({ type: 'PayPal' })).toEqual({
      type: 'PayPal',
    });
    expect(paymentMethodSchema.parse({ type: 'Stripe' }).type).toBe('Stripe');
    expect(paymentMethodSchema.parse({ type: 'CashOnDelivery' }).type).toBe(
      'CashOnDelivery'
    );

    const invalid = paymentMethodSchema.safeParse({ type: 'Bitcoin' });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.map((issue) => issue.message)).toContain(
        'Invalid payment method'
      );
    }

    expect(paymentMethodSchema.safeParse({ type: '' }).success).toBe(false);
  });
});

describe('order schemas', () => {
  it('accepts an order and an order item', () => {
    expect(
      insertOrderSchema.parse({
        userId: 'user-1',
        itemsPrice: '59.99',
        shippingPrice: '10.00',
        taxPrice: '9.00',
        totalPrice: '78.99',
        paymentMethod: 'PayPal',
        shippingAddress: address,
      }).userId
    ).toBe('user-1');

    expect(
      insertOrderItemSchema.parse({
        productId: 'prod-1',
        slug: 'polo-shirt',
        image: '/images/p1.jpg',
        name: 'Polo Shirt',
        price: '59.99',
        qty: 1,
      }).qty
    ).toBe(1);
  });

  it('rejects an unknown payment method', () => {
    const result = insertOrderSchema.safeParse({
      userId: 'user-1',
      itemsPrice: '59.99',
      shippingPrice: '10.00',
      taxPrice: '9.00',
      totalPrice: '78.99',
      paymentMethod: 'Bitcoin',
      shippingAddress: address,
    });
    expect(result.success).toBe(false);
  });
});

describe('payment, profile, and review schemas', () => {
  it('requires PayPal payment result fields', () => {
    expect(
      paymentResultSchema.parse({
        id: 'pay-1',
        status: 'COMPLETED',
        email_address: 'buyer@example.com',
        pricePaid: '59.99',
      }).status
    ).toBe('COMPLETED');
  });

  it('validates profile and admin user updates', () => {
    expect(updateProfileSchema.parse({ name: 'Jane', email: 'j@example.com' }).name).toBe(
      'Jane'
    );
    expect(updateProfileSchema.safeParse({ name: 'Ja', email: 'ab' }).success).toBe(
      false
    );

    expect(
      updateUserSchema.parse({
        name: 'Jane',
        email: 'jane@example.com',
        id: 'user-1',
        role: 'admin',
      }).role
    ).toBe('admin');
    expect(
      updateUserSchema.safeParse({
        name: 'Jane',
        email: 'jane@example.com',
        id: '',
        role: '',
      }).success
    ).toBe(false);
  });

  it('limits ratings to integers from 1 through 5', () => {
    const base = {
      title: 'Great',
      description: 'Loved it',
      productId: 'prod-1',
      userId: 'user-1',
    };

    expect(insertReviewSchema.parse({ ...base, rating: '4' }).rating).toBe(4);
    expect(insertReviewSchema.safeParse({ ...base, rating: 0 }).success).toBe(false);
    expect(insertReviewSchema.safeParse({ ...base, rating: 6 }).success).toBe(false);
    expect(insertReviewSchema.safeParse({ ...base, rating: 3.5 }).success).toBe(false);
    expect(insertReviewSchema.safeParse({ ...base, title: 'No' }).success).toBe(false);
  });
});
