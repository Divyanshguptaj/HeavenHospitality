import type { RegistrationDetailsView, submitRegistrationSchema } from '@heaven/contracts';
import type { User } from '@prisma/client';
import type { z } from 'zod';

import { AppError } from '../../errors/AppError.js';
import { fromPrismaDate, toPrismaDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { Actor } from '../../middleware/authenticate.js';

/**
 * The admission form, at the account level.
 *
 * Filled once, at signup — before any tenancy exists, which is why this lives
 * on the User row rather than a Tenancy. A NON_RESIDENT reaches this through
 * the one carve-out in their otherwise-empty permission set; a RESIDENT can
 * still read it, but never write it again once it is submitted.
 */

type RegistrationFields = Pick<
  User,
  | 'fatherName'
  | 'motherName'
  | 'parentMobile'
  | 'dateOfBirth'
  | 'aadhaarNumber'
  | 'collegeOrInstitute'
  | 'courseOrSemester'
  | 'permanentAddress'
  | 'bloodGroup'
  | 'parentOccupation'
  | 'vehicleNumber'
  | 'documentType'
  | 'documentOtherDescription'
  | 'documentImageUrl'
  | 'registrationCompletedAt'
>;

export function toRegistrationView(user: RegistrationFields): RegistrationDetailsView {
  return {
    fatherName: user.fatherName,
    motherName: user.motherName,
    parentMobile: user.parentMobile,
    dateOfBirth: user.dateOfBirth === null ? null : fromPrismaDate(user.dateOfBirth),
    aadhaarNumber: user.aadhaarNumber,
    collegeOrInstitute: user.collegeOrInstitute,
    courseOrSemester: user.courseOrSemester,
    permanentAddress: user.permanentAddress,
    bloodGroup: user.bloodGroup,
    parentOccupation: user.parentOccupation,
    vehicleNumber: user.vehicleNumber,
    documentType: user.documentType,
    documentOtherDescription: user.documentOtherDescription,
    documentImageUrl: user.documentImageUrl,
    completedAt: user.registrationCompletedAt?.toISOString() ?? null,
  };
}

export async function getRegistration(actor: Actor): Promise<RegistrationDetailsView> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  return toRegistrationView(user);
}

/**
 * The one-time admission form. Once submitted, only an admin can change it —
 * enforced here, not just hidden in the UI, since the endpoint is reachable
 * directly by anyone holding a token.
 */
export async function submitRegistration(
  actor: Actor,
  input: z.infer<typeof submitRegistrationSchema>,
): Promise<RegistrationDetailsView> {
  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { registrationCompletedAt: true },
  });
  if (existing.registrationCompletedAt !== null) {
    throw new AppError('ALREADY_EXISTS', 'This form has already been submitted. Contact the manager to correct it.');
  }

  const user = await prisma.user.update({
    where: { id: actor.userId },
    data: {
      fatherName: input.fatherName,
      motherName: input.motherName,
      parentMobile: input.parentMobile,
      dateOfBirth: toPrismaDate(input.dateOfBirth),
      aadhaarNumber: input.aadhaarNumber,
      collegeOrInstitute: input.collegeOrInstitute,
      courseOrSemester: input.courseOrSemester ?? null,
      permanentAddress: input.permanentAddress,
      bloodGroup: input.bloodGroup,
      parentOccupation: input.parentOccupation,
      vehicleNumber: input.vehicleNumber ?? null,
      documentType: input.documentType,
      documentOtherDescription: input.documentOtherDescription ?? null,
      documentImageUrl: input.documentImageUrl,
      registrationCompletedAt: new Date(),
    },
  });

  return toRegistrationView(user);
}
