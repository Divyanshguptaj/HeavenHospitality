import { publicGalleryQuerySchema, publicMenuDayQuerySchema } from '@heaven/contracts';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

import { getValidated, validate } from '../../middleware/validate.js';

import {
  getPublicAvailability,
  getPublicContact,
  getPublicFacilities,
  getPublicGallery,
  getPublicHome,
  getPublicLocation,
  getPublicProperty,
  getPublicRooms,
  getPublicRules,
  getTodaysMenu,
  getWeeklyMenu,
} from './public.service.js';

/**
 * The unauthenticated public API.
 *
 * Everything a guest, a signed-in NON_RESIDENT and a RESIDENT can see about the
 * property lives behind these routes. No route here reads an actor, none may
 * ever return tenant, staff, payment or occupancy-history data, and every
 * response is built by a public-only mapper rather than by reusing an owner
 * serializer. See docs/0004-authorization.md.
 *
 * The whole router is mounted behind a tighter per-IP rate limit than
 * authenticated traffic (see app.ts): there is no account to hold accountable
 * here, and scraping is the expected abuse.
 *
 * The property is implicit. The MVP runs one property, so the path carries no
 * slug and no id — there is nothing for a caller to enumerate.
 */
export const publicRouter: Router = Router();

/**
 * Wraps an async loader into a handler.
 *
 * Express 5 forwards a rejected promise to the error handler on its own, but
 * routing every response through one function is what guarantees each is
 * wrapped in the same success envelope. Twelve hand-written `.then(...)` blocks
 * is twelve chances to shape one of them differently.
 */
function send<T>(load: (req: Request) => Promise<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    load(req)
      .then((data) => {
        res.status(200).json({ success: true, data });
      })
      .catch(next);
  };
}

// --- The landing screen, in one request ------------------------------------
publicRouter.get('/home', send(() => getPublicHome()));

// --- Property, contact, location -------------------------------------------
publicRouter.get('/property', send(() => getPublicProperty()));
publicRouter.get('/contact', send(() => getPublicContact()));
publicRouter.get('/location', send(() => getPublicLocation()));

// --- Rooms ------------------------------------------------------------------
//
// `/rooms` carries the full room types plus the availability summary; the
// separate `/availability` is the cheap read for anyone who only wants the
// counts (a home widget, a "still free?" poll) without the descriptions.
publicRouter.get('/rooms', send(() => getPublicRooms()));
publicRouter.get('/availability', send(() => getPublicAvailability()));

// --- Mess -------------------------------------------------------------------
const menuDayQuery = { query: publicMenuDayQuerySchema } as const;

publicRouter.get(
  '/menu/today',
  validate(menuDayQuery),
  send((req) => {
    const { query } = getValidated<typeof menuDayQuery>(req);
    // `date` is optional: absent means "today in the property's timezone",
    // which the server decides. A client clock never gets to.
    return getTodaysMenu(query.date);
  }),
);

publicRouter.get('/menu/week', send(() => getWeeklyMenu()));

// --- Facilities, gallery, rules ---------------------------------------------
publicRouter.get('/facilities', send(() => getPublicFacilities()));
publicRouter.get('/rules', send(() => getPublicRules()));

const galleryQuery = { query: publicGalleryQuerySchema } as const;

publicRouter.get(
  '/gallery',
  validate(galleryQuery),
  send((req) => {
    const { query } = getValidated<typeof galleryQuery>(req);
    return getPublicGallery(query);
  }),
);
