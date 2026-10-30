import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const tenancy = { findFirst: vi.fn(), deleteMany: vi.fn() };
  const user = { delete: vi.fn() };
  const reminderEvent = { deleteMany: vi.fn() };
  const otpVerification = { deleteMany: vi.fn() };
  const auditLog = { create: vi.fn() };
  const client: Record<string, unknown> = { tenancy, user, reminderEvent, otpVerification, auditLog };
  client['$transaction'] = (callback: (tx: unknown) => unknown) => callback(client);
  return { client, tenancy, user, reminderEvent, otpVerification, auditLog };
});
const cloudinary = vi.hoisted(() => ({ deleteCloudinaryAsset: vi.fn() }));

vi.mock('../src/lib/prisma.js', () => ({ prisma: db.client }));
vi.mock('../src/modules/property/property.context.js', () => ({
  getPropertyContext: () => Promise.resolve({ propertyId: 'p1' }),
}));
vi.mock('../src/modules/uploads/cloudinary.service.js', () => cloudinary);

const { deleteResidentData } = await import('../src/modules/residents/residents.service.js');
type Actor = Parameters<typeof deleteResidentData>[0];

const actor = { userId: 'admin-1' } as Actor;

const found = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: 'u1',
    role: 'NON_RESIDENT',
    phone: '+919000000001',
    photoUrl: 'https://res.cloudinary.com/x/image/upload/v1/a/selfie.jpg',
    documentImageUrl: 'https://res.cloudinary.com/x/image/upload/v1/a/aadhaar.pdf',
    parentDocumentUrl: null,
    tenancies: [{ id: 't1', status: 'VACATED' }],
    complaints: [{ imageUrl: 'https://res.cloudinary.com/x/image/upload/v1/a/leak.jpg' }, { imageUrl: null }],
    ...overrides,
  },
});

beforeEach(() => {
  for (const group of [db.tenancy, db.user, db.reminderEvent, db.otpVerification, db.auditLog, cloudinary]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
});

describe('deleting a former resident', () => {
  it('erases the account and stays, then removes every file from Cloudinary', async () => {
    db.tenancy.findFirst.mockResolvedValue(found());

    await deleteResidentData(actor, 't1');

    expect(db.tenancy.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['t1'] } } });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(db.otpVerification.deleteMany).toHaveBeenCalledWith({ where: { phone: '+919000000001' } });
    expect(cloudinary.deleteCloudinaryAsset).toHaveBeenCalledTimes(3);
    expect(db.auditLog.create.mock.calls[0]?.[0].data.action).toBe('RESIDENT_DATA_DELETED');
  });

  it('refuses while any stay is still active', async () => {
    db.tenancy.findFirst.mockResolvedValue(
      found({ tenancies: [{ id: 't1', status: 'VACATED' }, { id: 't2', status: 'ACTIVE' }] }),
    );

    await expect(deleteResidentData(actor, 't1')).rejects.toThrow(/Remove this resident from their room/);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('never deletes an owner account', async () => {
    db.tenancy.findFirst.mockResolvedValue(found({ role: 'ADMIN' }));

    await expect(deleteResidentData(actor, 't1')).rejects.toThrow(/owner account/);
    expect(db.user.delete).not.toHaveBeenCalled();
  });

  it('reports a resident from another property as not found', async () => {
    db.tenancy.findFirst.mockResolvedValue(null);

    await expect(deleteResidentData(actor, 'other')).rejects.toThrow(/not found/);
  });
});
