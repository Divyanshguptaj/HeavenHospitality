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
 * There is no phone number, email address or UPI id written into this file. The
 * owner changing their number changes what this screen dials.
 *
 * Bank and UPI details appear only when the API sends them, and the API sends
 * them only when the owner has published that half. A field the owner has kept
 * private never reaches the device, so there is nothing here to hide.
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

            {contact.paymentDetails !== null && (
              <Card>
                <CardTitle>Payment details</CardTitle>
                <Body>
                  Shared here by the property. Always confirm with the manager before transferring
                  anything.
                </Body>

                {contact.paymentDetails.upi !== null && (
                  <>
                    {contact.paymentDetails.upi.upiId !== null && (
                      <DetailRow label="UPI" value={contact.paymentDetails.upi.upiId} />
                    )}
                  </>
                )}

                {contact.paymentDetails.bank !== null && (
                  <>
                    {contact.paymentDetails.bank.bankName !== null && (
                      <DetailRow label="Bank" value={contact.paymentDetails.bank.bankName} />
                    )}
                    {contact.paymentDetails.bank.accountName !== null && (
                      <DetailRow
                        label="Account name"
                        value={contact.paymentDetails.bank.accountName}
                      />
                    )}
                    {contact.paymentDetails.bank.accountNumber !== null && (
                      <DetailRow
                        label="Account no."
                        value={contact.paymentDetails.bank.accountNumber}
                      />
                    )}
                    {contact.paymentDetails.bank.ifsc !== null && (
                      <DetailRow label="IFSC" value={contact.paymentDetails.bank.ifsc} />
                    )}
                  </>
                )}
              </Card>
            )}

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
