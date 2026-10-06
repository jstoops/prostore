import { CartItem, ShippingAddress } from '@/types';

export const address: ShippingAddress = {
  fullName: 'Jane Doe',
  streetAddress: '123 Main St',
  city: 'Austin',
  postalCode: '78701',
  country: 'USA',
};

export function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'prod-1',
    name: 'Polo Shirt',
    slug: 'polo-shirt',
    qty: 1,
    image: '/images/p1.jpg',
    price: '59.99',
    ...overrides,
  };
}

export function productRecord(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'prod-1',
    name: 'Polo Shirt',
    slug: 'polo-shirt',
    category: 'Shirts',
    brand: 'Polo',
    description: 'A comfortable shirt',
    stock: 5,
    images: ['/images/p1.jpg'],
    isFeatured: false,
    banner: null,
    price: '59.99',
    rating: '0',
    numReviews: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export const validProductInput = {
  name: 'Polo Shirt',
  slug: 'polo-shirt',
  category: 'Shirts',
  brand: 'Polo',
  description: 'A comfortable shirt',
  stock: 5,
  images: ['/images/p1.jpg'],
  isFeatured: false,
  banner: null,
  price: '59.99',
};
