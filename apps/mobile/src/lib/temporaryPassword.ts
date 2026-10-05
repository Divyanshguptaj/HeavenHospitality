import type { TemporaryCredentialView } from '@heaven/contracts';
import { Alert, Share } from 'react-native';

/** Shows the owner a one-time password and offers to send it on. */
export function showTemporaryPassword(
  name: string,
  phone: string,
  credential: TemporaryCredentialView,
): void {
  const validUntil = new Date(credential.expiresAt).toLocaleDateString();
  const message =
    `Heaven Hospitality: sign in with your mobile number ${phone} and the temporary password ` +
    `${credential.temporaryPassword}. You will be asked to choose a new password. ` +
    `It works until ${validUntil}.`;

  Alert.alert(
    `Temporary password for ${name}`,
    `${credential.temporaryPassword}\n\nValid until ${validUntil}. It is shown only once.`,
    [
      { text: 'Done', style: 'cancel' },
      { text: 'Share', onPress: () => void Share.share({ message }) },
    ],
  );
}
