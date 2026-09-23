import type { ApiSuccess } from '@heaven/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';
import { getActor, requireAuth } from '../../middleware/authenticate.js';
import { getValidated, validate } from '../../middleware/validate.js';
import { MUTABLE_CATEGORIES } from './events.js';

/**
 * Device registration for push. Open to every signed-in role (owner and
 * resident alike), so it is mounted before the role-gated `/me` routers.
 */
export const devicesRouter: Router = Router();

devicesRouter.use(requireAuth());

const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]{10,200}\]$/;

const registerSchema = z.object({
  token: z.string().regex(EXPO_TOKEN, 'Not an Expo push token'),
  platform: z.enum(['android', 'ios']),
});

const unregisterSchema = z.object({ token: z.string().regex(EXPO_TOKEN) });

const preferencesSchema = z.object({
  mutedCategories: z.array(z.enum(['COMPLAINTS', 'NOTICES'])).max(2),
});

function handle<T>(
  work: (req: Request) => Promise<T>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    work(req)
      .then((data) => {
        const body: ApiSuccess<T> = { success: true, data };
        res.status(200).json(body);
      })
      .catch(next);
  };
}

devicesRouter.post(
  '/',
  validate({ body: registerSchema }),
  handle(async (req) => {
    const { body } = getValidated<{ body: typeof registerSchema }>(req);
    const { userId } = getActor(req);
    // A token belongs to one install. If a different account signed in on the
    // same device, it moves to the new account.
    await prisma.deviceToken.upsert({
      where: { token: body.token },
      create: { userId, token: body.token, platform: body.platform },
      update: { userId, platform: body.platform, lastSeenAt: new Date(), disabledAt: null },
    });
    return { registered: true };
  }),
);

devicesRouter.post(
  '/unregister',
  validate({ body: unregisterSchema }),
  handle(async (req) => {
    const { body } = getValidated<{ body: typeof unregisterSchema }>(req);
    const { userId } = getActor(req);
    await prisma.deviceToken.updateMany({
      where: { token: body.token, userId },
      data: { disabledAt: new Date() },
    });
    return { unregistered: true };
  }),
);

devicesRouter.get(
  '/preferences',
  handle(async (req) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: getActor(req).userId },
      select: { mutedNotificationKinds: true },
    });
    return { mutedCategories: user.mutedNotificationKinds, mutableCategories: MUTABLE_CATEGORIES };
  }),
);

devicesRouter.put(
  '/preferences',
  validate({ body: preferencesSchema }),
  handle(async (req) => {
    const { body } = getValidated<{ body: typeof preferencesSchema }>(req);
    await prisma.user.update({
      where: { id: getActor(req).userId },
      data: { mutedNotificationKinds: body.mutedCategories },
    });
    return { mutedCategories: body.mutedCategories };
  }),
);
