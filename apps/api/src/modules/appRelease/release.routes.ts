import type { ApiSuccess } from '@heaven/contracts';
import { Router, type Request, type Response } from 'express';

import {
  getAppVersionInfo,
  getLatestUpdate,
  isValidRuntimeVersion,
  noUpdateReply,
  replyFor,
  type AppVersionInfo,
} from './release.service.js';

export const appReleaseRouter: Router = Router();

/** The newest and the oldest app build allowed to run. */
appReleaseRouter.get('/version', (_req: Request, res: Response, next) => {
  getAppVersionInfo()
    .then((info) => {
      const body: ApiSuccess<AppVersionInfo> = { success: true, data: info };
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(body);
    })
    .catch(next);
});

/** Over-the-air updates: the manifest an installed app asks for on launch. */
appReleaseRouter.get('/updates/manifest', (req: Request, res: Response, next) => {
  const platform = req.header('expo-platform');
  const runtimeVersion = req.header('expo-runtime-version') ?? '';
  const currentUpdateId = req.header('expo-current-update-id');

  const send = (reply: { contentType: string; body: string }): void => {
    res.setHeader('expo-protocol-version', '1');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.setHeader('Content-Type', reply.contentType);
    res.status(200).send(Buffer.from(reply.body, 'utf8'));
  };

  if (platform !== 'android' || !isValidRuntimeVersion(runtimeVersion)) {
    send(noUpdateReply());
    return;
  }

  getLatestUpdate(runtimeVersion)
    .then((record) => send(replyFor(record, currentUpdateId)))
    .catch(next);
});
