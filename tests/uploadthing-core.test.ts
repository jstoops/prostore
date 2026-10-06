jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('uploadthing/server', () => ({
  UploadThingError: class UploadThingError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'UploadThingError';
    }
  },
}));

jest.mock('uploadthing/next', () => ({
  createUploadthing: () => () => ({
    middleware(fn: () => Promise<unknown>) {
      return {
        onUploadComplete(done: (args: { metadata: { userId?: string } }) => Promise<unknown>) {
          return { middleware: fn, onUploadComplete: done };
        },
      };
    },
  }),
}));

import { auth } from '@/auth';
import { ourFileRouter } from '@/app/api/uploadthing/core';

const imageUploader = ourFileRouter.imageUploader as unknown as {
  middleware: () => Promise<{ userId?: string }>;
  onUploadComplete: (args: { metadata: { userId?: string } }) => Promise<{ uploadedBy?: string }>;
};

describe('imageUploader', () => {
  it('rejects uploads without a session', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    await expect(imageUploader.middleware()).rejects.toThrow('Unauthorized');
  });

  it('allows a session that has no user id', async () => {
    (auth as jest.Mock).mockResolvedValue({});
    await expect(imageUploader.middleware()).resolves.toEqual({ userId: undefined });
  });

  it('returns the signed-in user and echoes them after upload', async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } });

    await expect(imageUploader.middleware()).resolves.toEqual({ userId: 'user-1' });
    await expect(
      imageUploader.onUploadComplete({ metadata: { userId: 'user-1' } })
    ).resolves.toEqual({ uploadedBy: 'user-1' });
  });
});
