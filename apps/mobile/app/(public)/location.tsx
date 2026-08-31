import { usePublicLocation } from '../../src/api/public';
import { Body, Button, Card, CardTitle, DetailRow, Muted, PageHeading } from '../../src/components/ui';
import { QueryScreen, openExternal } from '../../src/components/publicUi';

/**
 * Location — the address, and a button that opens the device's own map.
 *
 * No Maps SDK, no API key, no embedded web view. The deep link is built by the
 * SERVER from the coordinates or the written address, so every client opens the
 * same place and nothing here has to reimplement the URL — or escape an
 * owner-entered address correctly, which is the part that goes wrong.
 *
 * Opening the native map application is the whole feature: it already knows
 * where the person is, which map they prefer, and how to navigate.
 */
export default function LocationScreen() {
  const query = usePublicLocation();

  return (
    <QueryScreen query={query}>
      {(location) => (
        <>
          <PageHeading
            title="Location"
            subtitle={`${location.address.locality}, ${location.address.city}`}
          />

          <Card>
            <CardTitle>Address</CardTitle>
            <Body>{location.address.line}</Body>
            <Body>
              {location.address.locality}, {location.address.city}
            </Body>
            <Body>
              {location.address.state} {location.address.pincode}
            </Body>

            <Button
              label="Open in Maps"
              accessibilityLabel="Open this address in your maps app"
              onPress={() => {
                void openExternal(
                  location.mapsUrl,
                  'No maps app is available on this device. The address is shown above.',
                );
              }}
            />
          </Card>

          {location.coordinates !== null && (
            <Card>
              <CardTitle>Coordinates</CardTitle>
              <DetailRow
                label="Latitude"
                value={location.coordinates.latitude.toFixed(6)}
              />
              <DetailRow
                label="Longitude"
                value={location.coordinates.longitude.toFixed(6)}
              />
              <Muted>Useful if your map application cannot find the address by name.</Muted>
            </Card>
          )}

          <Muted>
            Nearest landmarks and directions are best confirmed by phone — call before you set off.
          </Muted>
        </>
      )}
    </QueryScreen>
  );
}
