import { z } from 'zod';
import {
  cn,
  convertToPlainObject,
  formatCurrency,
  formatDateTime,
  formatError,
  formatId,
  formatNumber,
  formatNumberWithDecimal,
  formUrlQuery,
  round2,
} from '@/lib/utils';

describe('cn', () => {
  it('merges class names and lets later tailwind utilities win', () => {
    expect(cn('p-2', 'text-sm', 'p-4')).toBe('text-sm p-4');
    expect(cn('font-bold', false && 'hidden', undefined, 'text-red-500')).toBe(
      'font-bold text-red-500'
    );
  });
});

describe('convertToPlainObject', () => {
  it('returns a plain clone and serializes dates', () => {
    const createdAt = new Date('2024-06-15T18:05:00.000Z');
    const value = { id: '1', createdAt, nested: { qty: 2 } };

    const plain = convertToPlainObject(value);

    expect(plain).toEqual({
      id: '1',
      createdAt: '2024-06-15T18:05:00.000Z',
      nested: { qty: 2 },
    });
    expect(plain).not.toBe(value);
  });

  it('drops undefined fields and preserves null', () => {
    expect(convertToPlainObject({ a: undefined, b: null })).toEqual({ b: null });
  });
});

describe('formatNumberWithDecimal', () => {
  it('pads to two decimal places without truncating extra precision', () => {
    expect(formatNumberWithDecimal(5)).toBe('5.00');
    expect(formatNumberWithDecimal(5.1)).toBe('5.10');
    expect(formatNumberWithDecimal(5.12)).toBe('5.12');
    expect(formatNumberWithDecimal(5.123)).toBe('5.123');
  });
});

describe('formatError', () => {
  it('joins Zod field messages', () => {
    const schema = z.object({
      name: z.string().min(3, 'Name must be at least 3 characters'),
      email: z.string().email('Invalid email address'),
    });

    try {
      schema.parse({ name: 'A', email: 'nope' });
      throw new Error('expected schema.parse to throw');
    } catch (error) {
      expect(formatError(error)).toBe(
        'Name must be at least 3 characters. Invalid email address'
      );
    }
  });

  it('describes a Prisma unique constraint', () => {
    expect(
      formatError({
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        meta: { target: ['email'] },
        message: 'Unique constraint failed',
      })
    ).toBe('Email already exists');
  });

  it('falls back to Field when the unique target is missing', () => {
    expect(
      formatError({
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
        message: 'Unique constraint failed',
      })
    ).toBe('Field already exists');
  });

  it('returns a string message for other errors', () => {
    expect(formatError(new Error('Cart session not found'))).toBe(
      'Cart session not found'
    );
  });

  it('stringifies a non-string message', () => {
    expect(formatError({ message: { code: 1 } })).toBe('{"code":1}');
  });
});

describe('round2', () => {
  it('rounds numbers and numeric strings to two decimal places', () => {
    expect(round2(10)).toBe(10);
    expect(round2(10.124)).toBe(10.12);
    expect(round2(10.126)).toBe(10.13);
    expect(round2('10.126')).toBe(10.13);
    expect(round2('')).toBe(0);
    expect(round2('abc')).toBeNaN();
  });

  it('rejects values that are not numbers or strings', () => {
    expect(() => round2(undefined as unknown as number)).toThrow(
      'Value is not a number or string'
    );
  });
});

describe('formatCurrency', () => {
  it('formats numbers and numeric strings as USD', () => {
    expect(formatCurrency(10)).toBe('$10.00');
    expect(formatCurrency('10.5')).toBe('$10.50');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('returns NaN when the amount is null', () => {
    expect(formatCurrency(null)).toBe('NaN');
  });
});

describe('formatNumber', () => {
  it('groups digits with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});

describe('formatId', () => {
  it('keeps the last six characters', () => {
    expect(formatId('abcdef123456')).toBe('..123456');
    expect(formatId('abc')).toBe('..abc');
  });
});

describe('formatDateTime', () => {
  it('formats date, time, and date-time in en-US', () => {
    const formatted = formatDateTime(new Date('2024-06-15T18:05:00.000Z'));

    expect(formatted).toEqual({
      dateTime: 'Jun 15, 2024, 6:05 PM',
      dateOnly: 'Sat, Jun 15, 2024',
      timeOnly: '6:05 PM',
    });
  });
});

describe('formUrlQuery', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = { location: { pathname: '/search' } } as Window &
      typeof globalThis;
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  it('updates an existing query parameter on the current path', () => {
    const url = formUrlQuery({
      params: 'q=shirt&page=2',
      key: 'page',
      value: '3',
    });

    const parsed = new URL(url, 'http://localhost');
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('q')).toBe('shirt');
    expect(parsed.searchParams.get('page')).toBe('3');
  });

  it('adds a new query parameter', () => {
    const url = formUrlQuery({
      params: 'q=shirt',
      key: 'category',
      value: 'Shirts',
    });

    const parsed = new URL(url, 'http://localhost');
    expect(parsed.searchParams.get('category')).toBe('Shirts');
    expect(parsed.searchParams.get('q')).toBe('shirt');
  });
});
