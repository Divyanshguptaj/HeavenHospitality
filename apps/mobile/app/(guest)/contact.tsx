import { Alert, Linking, StyleSheet, View } from 'react-native';

import { PropertyScreen } from '../../src/components/PropertyScreen';
import {
  Body,
  Button,
  Card,
  CardTitle,
  DetailRow,
  Muted,
  PageHeading,
} from '../../src/components/ui';
import { layout } from '../../src/theme';

/**
 * Opens a phone/mail/maps link, failing gracefully.
 *
 * `canOpenURL` is checked first because a device without a dialler (a tablet, an
 * emulator) would otherwise reject silently and leave the button looking broken.
 */
async function openExternal(url: string, unavailableMessage: string): Promise<void> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Not available', unavailableMessage);
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert('Something went wrong', unavailableMessage);
  }
}

export default function ContactScreen() {
  return (
    <PropertyScreen>
      {(property) => {
        const mapsQuery = encodeURIComponent(
          `${property.name}, ${property.address.line}, ${property.address.locality}, ` +
            `${property.address.city} ${property.address.pincode}`,
        );
        const mapsUrl =
          property.location === null
            ? `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
            : `https://www.google.com/maps/search/?api=1&query=${property.location.latitude},${property.location.longitude}`;

        return (
          <>
            <PageHeading
              title="Contact"
              subtitle="Call or visit — we are happy to show you around."
            />

            <Card>
              <CardTitle>Get in touch</CardTitle>
              <DetailRow label="Phone" value={property.contact.phone} />
              {property.contact.email !== null && (
                <DetailRow label="Email" value={property.contact.email} />
              )}

              <View style={styles.actions}>
                <Button
                  label="Call"
                  accessibilityLabel={`Call ${property.name} on ${property.contact.phone}`}
                  onPress={() => {
                    void openExternal(
                      `tel:${property.contact.phone}`,
                      'This device cannot place calls. The number is shown above.',
                    );
                  }}
                />
                {property.contact.email !== null && (
                  <Button
                    label="Email"
                    variant="secondary"
                    accessibilityLabel={`Email ${property.contact.email}`}
                    onPress={() => {
                      void openExternal(
                        `mailto:${property.contact.email ?? ''}`,
                        'No mail app is set up. The address is shown above.',
                      );
                    }}
                  />
                )}
              </View>
            </Card>

            <Card>
              <CardTitle>Visit us</CardTitle>
              <Body>{property.address.line}</Body>
              <Body>
                {property.address.locality}, {property.address.city}
              </Body>
              <Body>
                {property.address.state} {property.address.pincode}
              </Body>

              <Button
                label="Open in Maps"
                variant="secondary"
                onPress={() => {
                  void openExternal(mapsUrl, 'No maps app is available on this device.');
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
    </PropertyScreen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: layout.spacing[4], flexWrap: 'wrap' },
});
