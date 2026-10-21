// Shared formatting/normalization utilities for Room records coming from the
// backend API. No mock/demo room records live here — the Rooms API/database
// is the only source of room data on the public site.
export function formatRent(monthlyRent) {
  if (!monthlyRent || monthlyRent <= 0) return 'Price on Request'
  return `₹${Number(monthlyRent).toLocaleString('en-IN')} / month`
}

export function normalizeRoom(room) {
  return {
    id: room._id || room.id,
    name: room.name,
    monthlyRent: room.monthlyRent ?? 0,
    price: formatRent(room.monthlyRent),
    acType: room.acType || 'Non-AC',
    totalCapacity: room.totalCapacity ?? null,
    vacantBeds: room.vacantBeds ?? null,
    availability: room.availabilityStatus || 'On Request',
    tag: room.tag || '',
    description: room.description || '',
    tags: room.amenities?.length ? room.amenities : room.features || [],
    image: room.images?.[0] || null,
  }
}
