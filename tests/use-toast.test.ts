import { reducer, toast } from '@/hooks/use-toast';

type ToastState = { toasts: Array<{ id: string; open?: boolean; title?: string }> };

describe('toast reducer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps only the newest toast', () => {
    const next = reducer({ toasts: [{ id: 'old', title: 'Old' }] }, {
      type: 'ADD_TOAST',
      toast: { id: 'new', title: 'New' },
    });

    expect(next.toasts).toEqual([{ id: 'new', title: 'New' }]);
  });

  it('updates a toast by id', () => {
    const state: ToastState = {
      toasts: [
        { id: '1', title: 'A' },
        { id: '2', title: 'B' },
      ],
    };

    expect(
      reducer(state, { type: 'UPDATE_TOAST', toast: { id: '2', title: 'C' } }).toasts
    ).toEqual([
      { id: '1', title: 'A' },
      { id: '2', title: 'C' },
    ]);
  });

  it('dismisses one toast or every toast and queues removal once', () => {
    const dismissed = reducer(
      { toasts: [{ id: '1', open: true }] },
      { type: 'DISMISS_TOAST', toastId: '1' }
    );
    expect(dismissed.toasts).toEqual([{ id: '1', open: false }]);
    expect(jest.getTimerCount()).toBe(1);

    reducer(dismissed, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(jest.getTimerCount()).toBe(1);

    const all = reducer(
      {
        toasts: [
          { id: '1', open: true },
          { id: '2', open: true },
        ],
      },
      { type: 'DISMISS_TOAST' }
    );
    expect(all.toasts.every((item) => item.open === false)).toBe(true);
  });

  it('deletes a dismissed toast after the remove delay', () => {
    reducer(
      { toasts: [{ id: 'keep-me', open: true }] },
      { type: 'DISMISS_TOAST', toastId: 'keep-me' }
    );

    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(1_000_000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('removes one toast or clears the list', () => {
    const state: ToastState = { toasts: [{ id: '1' }, { id: '2' }] };
    expect(reducer(state, { type: 'REMOVE_TOAST', toastId: '1' }).toasts).toEqual([
      { id: '2' },
    ]);
    expect(reducer(state, { type: 'REMOVE_TOAST' }).toasts).toEqual([]);
  });

  it('returns an id plus dismiss and update functions', () => {
    const first = toast({ title: 'Hello' });
    const second = toast({ title: 'Again' });

    expect(Number(second.id)).toBe(Number(first.id) + 1);
    expect(first.dismiss).toEqual(expect.any(Function));
    expect(first.update).toEqual(expect.any(Function));

    first.update({ id: first.id, title: 'Updated' });
    first.dismiss();
    jest.advanceTimersByTime(1_000_000);
  });
});
