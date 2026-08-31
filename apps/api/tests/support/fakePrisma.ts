import { randomUUID } from 'node:crypto';

/**
 * An in-memory stand-in for the subset of Prisma that authentication uses.
 *
 * Auth is where the security rules live — code expiry, attempt limits, one-time
 * use, account lockout, session revocation — and those rules are worth testing
 * directly rather than through a mock that returns whatever the test wants. This
 * fake stores rows and applies real `where` matching, so the service under test
 * takes the same branches it would against PostgreSQL.
 *
 * What it deliberately does NOT reproduce: SQL-level constraints, cascades, or
 * transaction rollback. Those belong to the database, are covered by the
 * migration, and pretending to implement them here would test the fake instead
 * of the system.
 */

type Row = Record<string, unknown>;

/** Matches Prisma's `where` for the shapes the auth code actually uses. */
function matches(row: Row, where: Row | undefined): boolean {
  if (where === undefined) return true;

  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') {
      return (expected as Row[]).some((clause) => matches(row, clause));
    }

    const actual = row[key];

    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      const condition = expected as Row;
      if ('in' in condition) return (condition['in'] as unknown[]).includes(actual);
      if ('not' in condition) return actual !== condition['not'];
      throw new Error(`fakePrisma: unsupported condition on "${key}": ${JSON.stringify(expected)}`);
    }

    if (expected instanceof Date && actual instanceof Date) {
      return expected.getTime() === actual.getTime();
    }

    return actual === expected;
  });
}

function sortRows(rows: Row[], orderBy: Row | undefined): Row[] {
  if (orderBy === undefined) return rows;

  const [field, direction] = Object.entries(orderBy)[0] as [string, 'asc' | 'desc'];

  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    const leftValue = left instanceof Date ? left.getTime() : Number(left);
    const rightValue = right instanceof Date ? right.getTime() : Number(right);
    return direction === 'desc' ? rightValue - leftValue : leftValue - rightValue;
  });
}

class Table {
  readonly rows: Row[] = [];

  constructor(private readonly defaults: () => Row) {}

  create({ data }: { data: Row }): Promise<Row> {
    const row = { id: randomUUID(), ...this.defaults(), ...data };
    this.rows.push(row);
    return Promise.resolve({ ...row });
  }

  findFirst(args: { where?: Row; orderBy?: Row } = {}): Promise<Row | null> {
    const found = sortRows(
      this.rows.filter((row) => matches(row, args.where)),
      args.orderBy,
    )[0];
    return Promise.resolve(found === undefined ? null : { ...found });
  }

  findUnique(args: { where: Row }): Promise<Row | null> {
    return this.findFirst({ where: args.where });
  }

  async findUniqueOrThrow(args: { where: Row }): Promise<Row> {
    const found = await this.findUnique(args);
    if (found === null) throw new Error('fakePrisma: findUniqueOrThrow matched no row');
    return found;
  }

  update({ where, data }: { where: Row; data: Row }): Promise<Row> {
    const row = this.rows.find((candidate) => matches(candidate, where));
    if (row === undefined) throw new Error('fakePrisma: update matched no row');
    Object.assign(row, data);
    return Promise.resolve({ ...row });
  }

  updateMany({ where, data }: { where?: Row; data: Row }): Promise<{ count: number }> {
    const affected = this.rows.filter((row) => matches(row, where));
    for (const row of affected) Object.assign(row, data);
    return Promise.resolve({ count: affected.length });
  }

  async upsert({ where, create, update }: { where: Row; create: Row; update: Row }): Promise<Row> {
    // Compound unique keys arrive as `{ userId_propertyId: { ... } }`; flatten
    // them so the same matcher works for simple and compound lookups.
    const flattened: Row = {};
    for (const [key, value] of Object.entries(where)) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        Object.assign(flattened, value);
      } else {
        flattened[key] = value;
      }
    }

    const existing = this.rows.find((row) => matches(row, flattened));
    if (existing === undefined) return this.create({ data: create });

    Object.assign(existing, update);
    return Promise.resolve({ ...existing });
  }

  deleteMany({ where }: { where?: Row } = {}): Promise<{ count: number }> {
    const keep = this.rows.filter((row) => !matches(row, where));
    const removed = this.rows.length - keep.length;
    this.rows.length = 0;
    this.rows.push(...keep);
    return Promise.resolve({ count: removed });
  }

  reset(): void {
    this.rows.length = 0;
  }
}

const now = () => new Date();

export const userTable = new Table(() => ({
  email: null,
  phone: null,
  phoneVerifiedAt: null,
  role: 'RESIDENT',
  passwordHash: null,
  status: 'ACTIVE',
  mustChangePassword: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastFailedLoginAt: null,
  lastLoginAt: null,
  createdAt: now(),
  updatedAt: now(),
}));

export const otpTable = new Table(() => ({
  attempts: 0,
  consumedAt: null,
  verificationTokenHash: null,
  verificationExpiresAt: null,
  createdAt: now(),
}));

export const sessionTable = new Table(() => ({
  deviceLabel: null,
  ipAddress: null,
  revokedAt: null,
  replacedById: null,
  createdAt: now(),
}));

export const propertyTable = new Table(() => ({ status: 'ACTIVE', createdAt: now() }));
export const membershipTable = new Table(() => ({ createdAt: now() }));

/**
 * `include` is applied here rather than inside Table, because only two shapes
 * are ever asked for and hand-resolving them is clearer than a generic joiner
 * that would need to understand the whole schema.
 */
function withMemberships(user: Row | null): Row | null {
  if (user === null) return null;

  const memberships = membershipTable.rows
    .filter((membership) => membership['userId'] === user['id'])
    .map((membership) => {
      const property = propertyTable.rows.find((p) => p['id'] === membership['propertyId']);
      return {
        propertyId: membership['propertyId'],
        role: membership['role'],
        property: {
          slug: property?.['slug'] ?? 'seeded-property',
          name: property?.['name'] ?? 'Seeded Property',
        },
      };
    });

  return { ...user, memberships };
}

const userDelegate = {
  findUnique: async (args: { where: Row; include?: Row }) =>
    args.include === undefined
      ? userTable.findUnique(args)
      : withMemberships(await userTable.findUnique(args)),
  findFirst: async (args: { where?: Row; include?: Row; orderBy?: Row }) =>
    args.include === undefined
      ? userTable.findFirst(args)
      : withMemberships(await userTable.findFirst(args)),
  findUniqueOrThrow: async (args: { where: Row; include?: Row }) => {
    const found =
      args.include === undefined
        ? await userTable.findUniqueOrThrow(args)
        : withMemberships(await userTable.findUniqueOrThrow(args));
    if (found === null) throw new Error('fakePrisma: findUniqueOrThrow matched no row');
    return found;
  },
  create: (args: { data: Row }) => userTable.create(args),
  update: (args: { where: Row; data: Row }) => userTable.update(args),
  updateMany: (args: { where?: Row; data: Row }) => userTable.updateMany(args),
  deleteMany: (args: { where?: Row }) => userTable.deleteMany(args),
};

const sessionDelegate = {
  create: (args: { data: Row }) => sessionTable.create(args),
  findUnique: async (args: { where: Row; include?: Row }) => {
    const session = await sessionTable.findUnique(args);
    if (session === null || args.include === undefined) return session;

    const user = withMemberships(
      await userTable.findUnique({ where: { id: session['userId'] as string } }),
    );
    return { ...session, user };
  },
  update: (args: { where: Row; data: Row }) => sessionTable.update(args),
  updateMany: (args: { where?: Row; data: Row }) => sessionTable.updateMany(args),
};

/** Named so `$transaction` can refer to the client it hands back. */
interface FakePrismaClient {
  readonly user: typeof userDelegate;
  readonly otpVerification: Table;
  readonly refreshSession: typeof sessionDelegate;
  readonly property: Table;
  readonly propertyMembership: Table;
  readonly $transaction: <T>(fn: (tx: FakePrismaClient) => Promise<T>) => Promise<T>;
}

export const fakePrisma: FakePrismaClient = {
  user: userDelegate,
  otpVerification: otpTable,
  refreshSession: sessionDelegate,
  property: propertyTable,
  propertyMembership: membershipTable,
  /**
   * Runs the callback against the same store. No rollback: these tests assert
   * on committed outcomes, and a fake that pretended to roll back would be
   * asserting its own behaviour rather than the service's.
   */
  $transaction: <T>(fn: (tx: FakePrismaClient) => Promise<T>): Promise<T> => fn(fakePrisma),
};

export function resetFakePrisma(): void {
  for (const table of [userTable, otpTable, sessionTable, propertyTable, membershipTable]) {
    table.reset();
  }
}

/** The single ACTIVE property the auth service looks up when creating accounts. */
export function seedProperty(): Promise<Row> {
  return propertyTable.create({
    data: { slug: 'heaven-test', name: 'Heaven Test', status: 'ACTIVE' },
  });
}
