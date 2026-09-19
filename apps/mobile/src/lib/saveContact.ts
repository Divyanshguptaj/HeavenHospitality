import { Alert } from 'react-native';

import type * as ContactsModule from 'expo-contacts';

/**
 * Opens the phone's native "new contact" form, pre-filled with the property's
 * name and number, so enquiring means saving the number rather than sending a
 * message the owner might not see right away.
 *
 * `expo-contacts` is a native module: loaded on demand rather than at module
 * scope, so a dev client built before it was added degrades to a friendly
 * message instead of crashing the screen that imports this file.
 *
 * Metro's module loader "guards" a module whose top-level code throws — it
 * logs the error itself and hands back whatever partial exports resulted,
 * rather than rejecting the `import()` — so a missing native module shows up
 * as functions that are `undefined`, not as a catchable exception.
 */
export async function presentAddContact(name: string, phone: string): Promise<void> {
  let Contacts: typeof ContactsModule;
  try {
    Contacts = await import('expo-contacts');
  } catch {
    Alert.alert('Update needed', 'Saving a contact needs a newer version of the app.');
    return;
  }
  if (typeof Contacts.requestPermissionsAsync !== 'function') {
    Alert.alert('Update needed', 'Saving a contact needs a newer version of the app.');
    return;
  }

  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Allow contacts access to save this number.');
    return;
  }

  try {
    await Contacts.presentFormAsync(null, {
      contactType: Contacts.ContactTypes.Company,
      name,
      company: name,
      phoneNumbers: [{ number: phone, label: 'mobile', isPrimary: true }],
    });
  } catch (error) {
    console.error('[contacts] could not open the new-contact form', error);
    Alert.alert('Could not open Contacts', 'Please try again.');
  }
}
