/**
 * Development seed.
 *
 * Creates one fully-populated property so the guest experience has something
 * real to render. Idempotent: re-running updates in place rather than creating
 * duplicates, so it is safe to run against a database that already has data.
 *
 *   pnpm --filter @heaven/api run db:seed
 */
import { BedStatus, MealType, PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const PROPERTY_SLUG = 'heaven-hospitality-kothrud';

/** Rent is written in rupees here for readability and converted once, on the way in. */
const rupees = (amount: number): number => amount * 100;

const ROOM_TYPES: ReadonlyArray<{
  name: string;
  sharingCapacity: number;
  rent: number;
  deposit: number;
  description: string;
  amenities: string[];
  sortOrder: number;
}> = [
  {
    name: 'Single Occupancy (AC)',
    sharingCapacity: 1,
    rent: 14_500,
    deposit: 29_000,
    description: 'A private room with an attached bathroom, study desk and wardrobe.',
    amenities: ['Air conditioning', 'Attached bathroom', 'Study desk', 'Wardrobe', 'Balcony'],
    sortOrder: 1,
  },
  {
    name: 'Two Sharing (AC)',
    sharingCapacity: 2,
    rent: 9_500,
    deposit: 19_000,
    description: 'Shared with one other resident. Separate bed, desk and wardrobe each.',
    amenities: ['Air conditioning', 'Attached bathroom', 'Study desk', 'Wardrobe'],
    sortOrder: 2,
  },
  {
    name: 'Three Sharing (Non-AC)',
    sharingCapacity: 3,
    rent: 7_000,
    deposit: 14_000,
    description: 'Our most popular room. Ceiling fan, ample storage and a common balcony.',
    amenities: ['Ceiling fan', 'Common bathroom', 'Study desk', 'Wardrobe'],
    sortOrder: 3,
  },
];

const FACILITIES: ReadonlyArray<{ label: string; icon: string }> = [
  { label: 'High-speed Wi-Fi', icon: 'wifi' },
  { label: 'Three meals a day', icon: 'utensils' },
  { label: 'Laundry service', icon: 'shirt' },
  { label: 'Housekeeping', icon: 'sparkles' },
  { label: 'Power backup', icon: 'zap' },
  { label: 'CCTV & biometric entry', icon: 'shield' },
  { label: 'Hot water', icon: 'droplet' },
  { label: 'Common study room', icon: 'book' },
];

const RULES: readonly string[] = [
  'Entry closes at 11:00 PM. Late entry needs prior intimation to the manager.',
  'Visitors are allowed in the common area until 8:00 PM only.',
  'Rent is due on the 5th of every month.',
  'Smoking and alcohol are not permitted anywhere on the premises.',
  'Please inform the kitchen a day in advance if you will miss a meal.',
  'A one-month notice is required before vacating.',
];

const MENU: ReadonlyArray<{ dayOfWeek: number; mealType: MealType; items: string[] }> = [
  { dayOfWeek: 1, mealType: MealType.BREAKFAST, items: ['Poha', 'Banana', 'Tea'] },
  {
    dayOfWeek: 1,
    mealType: MealType.LUNCH,
    items: ['Dal Tadka', 'Jeera Rice', 'Chapati', 'Salad'],
  },
  { dayOfWeek: 1, mealType: MealType.SNACKS, items: ['Biscuits', 'Tea'] },
  { dayOfWeek: 1, mealType: MealType.DINNER, items: ['Paneer Butter Masala', 'Chapati', 'Rice'] },
  { dayOfWeek: 2, mealType: MealType.BREAKFAST, items: ['Upma', 'Boiled Egg', 'Tea'] },
  { dayOfWeek: 2, mealType: MealType.LUNCH, items: ['Rajma', 'Rice', 'Chapati', 'Curd'] },
  { dayOfWeek: 2, mealType: MealType.SNACKS, items: ['Samosa', 'Tea'] },
  { dayOfWeek: 2, mealType: MealType.DINNER, items: ['Mix Veg', 'Chapati', 'Dal', 'Rice'] },
  { dayOfWeek: 3, mealType: MealType.BREAKFAST, items: ['Idli', 'Sambar', 'Coconut Chutney'] },
  { dayOfWeek: 3, mealType: MealType.LUNCH, items: ['Chole', 'Rice', 'Chapati', 'Papad'] },
  { dayOfWeek: 3, mealType: MealType.SNACKS, items: ['Poha', 'Tea'] },
  { dayOfWeek: 3, mealType: MealType.DINNER, items: ['Aloo Gobi', 'Chapati', 'Dal Fry', 'Rice'] },
  { dayOfWeek: 4, mealType: MealType.BREAKFAST, items: ['Paratha', 'Curd', 'Tea'] },
  { dayOfWeek: 4, mealType: MealType.LUNCH, items: ['Kadhi', 'Rice', 'Chapati', 'Salad'] },
  { dayOfWeek: 4, mealType: MealType.SNACKS, items: ['Bhel', 'Tea'] },
  { dayOfWeek: 4, mealType: MealType.DINNER, items: ['Egg Curry / Soya Curry', 'Chapati', 'Rice'] },
  { dayOfWeek: 5, mealType: MealType.BREAKFAST, items: ['Sheera', 'Bread Butter', 'Tea'] },
  { dayOfWeek: 5, mealType: MealType.LUNCH, items: ['Dal Fry', 'Rice', 'Chapati', 'Pickle'] },
  { dayOfWeek: 5, mealType: MealType.SNACKS, items: ['Vada Pav', 'Tea'] },
  { dayOfWeek: 5, mealType: MealType.DINNER, items: ['Veg Pulao', 'Raita', 'Papad'] },
  { dayOfWeek: 6, mealType: MealType.BREAKFAST, items: ['Misal Pav', 'Tea'] },
  { dayOfWeek: 6, mealType: MealType.LUNCH, items: ['Sambar', 'Rice', 'Chapati', 'Curd'] },
  { dayOfWeek: 6, mealType: MealType.SNACKS, items: ['Pakora', 'Tea'] },
  {
    dayOfWeek: 6,
    mealType: MealType.DINNER,
    items: ['Chicken / Paneer Masala', 'Chapati', 'Rice'],
  },
  { dayOfWeek: 7, mealType: MealType.BREAKFAST, items: ['Dosa', 'Chutney', 'Tea'] },
  { dayOfWeek: 7, mealType: MealType.LUNCH, items: ['Veg Biryani', 'Raita', 'Papad'] },
  { dayOfWeek: 7, mealType: MealType.SNACKS, items: ['Fruit Bowl'] },
  { dayOfWeek: 7, mealType: MealType.DINNER, items: ['Dal Khichdi', 'Kadhi', 'Papad'] },
];

/**
 * Rooms, and how many beds in each are already taken. Occupancy is deliberately
 * uneven so the guest availability view shows a realistic mix rather than
 * everything being free.
 */
const ROOMS: ReadonlyArray<{
  number: string;
  floor: number;
  typeName: string;
  occupied: number;
}> = [
  { number: '101', floor: 1, typeName: 'Single Occupancy (AC)', occupied: 1 },
  { number: '102', floor: 1, typeName: 'Single Occupancy (AC)', occupied: 0 },
  { number: '103', floor: 1, typeName: 'Two Sharing (AC)', occupied: 2 },
  { number: '104', floor: 1, typeName: 'Two Sharing (AC)', occupied: 1 },
  { number: '201', floor: 2, typeName: 'Two Sharing (AC)', occupied: 2 },
  { number: '202', floor: 2, typeName: 'Three Sharing (Non-AC)', occupied: 3 },
  { number: '203', floor: 2, typeName: 'Three Sharing (Non-AC)', occupied: 1 },
  { number: '204', floor: 2, typeName: 'Three Sharing (Non-AC)', occupied: 0 },
  { number: '301', floor: 3, typeName: 'Three Sharing (Non-AC)', occupied: 2 },
  { number: '302', floor: 3, typeName: 'Three Sharing (Non-AC)', occupied: 3 },
];

async function main(): Promise<void> {
  const property = await prisma.property.upsert({
    where: { slug: PROPERTY_SLUG },
    update: {},
    create: {
      slug: PROPERTY_SLUG,
      name: 'Heaven Hospitality',
      tagline: 'A calmer place to live and study in Kothrud',
      description:
        'Heaven Hospitality is a managed residence for students and working professionals in ' +
        'Kothrud, Pune. Furnished rooms, three home-style meals a day, reliable Wi-Fi and ' +
        'housekeeping — so you can get on with your work.',
      isPubliclyListed: true,
      addressLine: 'Plot 14, Mayur Colony',
      locality: 'Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      latitude: '18.507600',
      longitude: '73.807600',
      contactPhone: '+919876543210',
      contactEmail: 'stay@heavenhospitality.in',
    },
  });

  // Child collections are replaced wholesale: they are small, fully owned by the
  // property, and this keeps the seed idempotent without diffing every row.
  await prisma.$transaction([
    prisma.facility.deleteMany({ where: { propertyId: property.id } }),
    prisma.propertyRule.deleteMany({ where: { propertyId: property.id } }),
    prisma.weeklyMenuItem.deleteMany({ where: { propertyId: property.id } }),
    prisma.facility.createMany({
      data: FACILITIES.map((facility, index) => ({
        propertyId: property.id,
        label: facility.label,
        icon: facility.icon,
        sortOrder: index,
      })),
    }),
    prisma.propertyRule.createMany({
      data: RULES.map((text, index) => ({ propertyId: property.id, text, sortOrder: index })),
    }),
    prisma.weeklyMenuItem.createMany({
      data: MENU.map((entry) => ({ propertyId: property.id, ...entry })),
    }),
  ]);

  const roomTypesByName = new Map<string, string>();
  for (const type of ROOM_TYPES) {
    const record = await prisma.roomType.upsert({
      where: { propertyId_name: { propertyId: property.id, name: type.name } },
      update: {
        sharingCapacity: type.sharingCapacity,
        baseRentPaise: rupees(type.rent),
        depositPaise: rupees(type.deposit),
        description: type.description,
        amenities: type.amenities,
        sortOrder: type.sortOrder,
      },
      create: {
        propertyId: property.id,
        name: type.name,
        sharingCapacity: type.sharingCapacity,
        baseRentPaise: rupees(type.rent),
        depositPaise: rupees(type.deposit),
        description: type.description,
        amenities: type.amenities,
        sortOrder: type.sortOrder,
      },
    });
    roomTypesByName.set(type.name, record.id);
  }

  for (const room of ROOMS) {
    const roomTypeId = roomTypesByName.get(room.typeName);
    if (roomTypeId === undefined) throw new Error(`Unknown room type: ${room.typeName}`);

    const type = ROOM_TYPES.find((candidate) => candidate.name === room.typeName);
    if (type === undefined) throw new Error(`Unknown room type: ${room.typeName}`);

    const record = await prisma.room.upsert({
      where: { propertyId_number: { propertyId: property.id, number: room.number } },
      update: { roomTypeId, floor: room.floor },
      create: { propertyId: property.id, roomTypeId, number: room.number, floor: room.floor },
    });

    const beds: Prisma.BedCreateManyInput[] = Array.from(
      { length: type.sharingCapacity },
      (_unused, index) => ({
        roomId: record.id,
        label: String.fromCharCode(65 + index),
        status: index < room.occupied ? BedStatus.OCCUPIED : BedStatus.AVAILABLE,
      }),
    );

    await prisma.bed.deleteMany({ where: { roomId: record.id } });
    await prisma.bed.createMany({ data: beds });
  }

  const bedCount = await prisma.bed.count();
  const availableCount = await prisma.bed.count({ where: { status: BedStatus.AVAILABLE } });

  process.stdout.write(
    `Seeded "${property.name}" (${PROPERTY_SLUG}): ` +
      `${ROOMS.length} rooms, ${bedCount} beds, ${availableCount} available.\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
