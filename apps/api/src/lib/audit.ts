import type { AuditAction, Prisma, PrismaClient } from '@prisma/client';

/**
 * Writes an audit entry.
 *
 * Call this INSIDE the same transaction as the change it describes, by passing
 * the transaction client — an action and its audit record must not be able to
 * diverge.
 *
 * `before`/`after` take a redacted field allowlist, never a whole row. An
 * unrestricted diff would make this the single leakiest table in the database:
 * the one place every past value of every field is kept forever.
 * See docs/0008-data-protection.md.
 */
export interface AuditInput {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId?: string | undefined;
  readonly propertyId?: string | undefined;
  /** One human-readable line for the owner's activity feed. */
  readonly summary: string;
  readonly actorUserId?: string | undefined;
  readonly actorRole?: string | undefined;
  readonly before?: Prisma.InputJsonValue | undefined;
  readonly after?: Prisma.InputJsonValue | undefined;
  readonly ipAddress?: string | undefined;
  readonly requestId?: string | undefined;
}

/** The subset of the client available inside `$transaction`. */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function writeAudit(client: TransactionClient, input: AuditInput): Promise<void> {
  await client.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      propertyId: input.propertyId ?? null,
      summary: input.summary,
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      ipAddress: input.ipAddress ?? null,
      requestId: input.requestId ?? null,
      // Omitted rather than set to null: Prisma distinguishes a SQL NULL from a
      // JSON null for Json columns, and we want the column itself to be NULL.
      ...(input.before === undefined ? {} : { before: input.before }),
      ...(input.after === undefined ? {} : { after: input.after }),
    },
  });
}
