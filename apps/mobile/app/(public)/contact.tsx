import { formatIndianPhone } from '@heaven/contracts';
import { StyleSheet, View } from 'react-native';

import { usePublicContact } from '../../src/api/public';
import {
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Muted,
  PageHeading,
} from '../../src/components/ui';
import { QueryScreen, openExternal, whatsappUrl } from '../../src/components/publicUi';
import { layout } from '../../src/theme';

/**
 * Contact — every way of reaching the property, all of it from the database.
 *
 * There is no phone number, email address or address written into this file.
 * The owner changing their number changes what this screen dials.
 */
export default function ContactScreen() {
  const query = usePublicContact();

  return (
    <QueryScreen query={query}>
      {(contact) => {
        const enquiry = 'Hi, I am enquiring about a room. Is anything available?';

        return (
          <>
            <PageHeading
              title="Contact"
              subtitle="Call or visit — we are happy to show you around."
            />

            <Card>
              <CardTitle>Get in touch</CardTitle>
              <DetailRow label="Phone" value={formatIndianPhone(contact.phone)} />
              {contact.whatsappPhone !== null && (
                <DetailRow label="WhatsApp" value={formatIndianPhone(contact.whatsappPhone)} />
              )}
              {contact.email !== null && <DetailRow label="Email" value={contact.email} />}

              <View style={styles.actions}>
                <Button
                  label="Call"
                  variant="secondary"
                  accessibilityLabel={`Call ${contact.phone}`}
                  onPress={() => {
                    void openExternal(
                      `tel:${contact.phone}`,
                      'This device cannot place calls. The number is shown above.',
                    );
                  }}
                />
                {contact.whatsappPhone !== null && (
                  <Button
                    label="WhatsApp"
                    variant="secondary"
                    accessibilityLabel={`Message ${contact.whatsappPhone} on WhatsApp`}
                    onPress={() => {
                      void openExternal(
                        whatsappUrl(contact.whatsappPhone ?? '', enquiry),
                        'WhatsApp is not installed. The number is shown above.',
                      );
                    }}
                  />
                )}
                {contact.email !== null && (
                  <Button
                    label="Email"
                    variant="secondary"
                    accessibilityLabel={`Email ${contact.email}`}
                    onPress={() => {
                      void openExternal(
                        `mailto:${contact.email ?? ''}`,
                        'No mail app is set up. The address is shown above.',
                      );
                    }}
                  />
                )}
              </View>
            </Card>

            <Card>
              <CardTitle>Visit us</CardTitle>
              <Body>{contact.location.address.line}</Body>
              <Body>
                {contact.location.address.locality}, {contact.location.address.city}
              </Body>
              <Body>
                {contact.location.address.state} {contact.location.address.pincode}
              </Body>
              <Button
                label="Open in Maps"
                variant="secondary"
                onPress={() => {
                  void openExternal(
                    contact.location.mapsUrl,
                    'No maps app is available on this device.',
                  );
                }}
              />
            </Card>

            <Muted>
              Visiting hours are 9:00 AM to 8:00 PM. Please call ahead so someone is free to show
              you the rooms.
            </Muted>
          </>
        );
      }}
    </QueryScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: layout.spacing[4], flexWrap: 'wrap' },
});
