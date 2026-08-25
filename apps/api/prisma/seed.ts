/**
 * Development seed.
 *
 * Builds a property that looks like a real one mid-operation: floors, rooms with
 * different capacities, a realistic mix of occupied and free beds, residents at
 * different stages, and — importantly — invoices in every state (paid, unpaid,
 * overdue) so every screen has something true to show.
 *
 * Idempotent: re-running resets the seeded property rather than duplicating it.
 *
 *   pnpm db:seed
 */
import { MealType, MembershipRole, PrismaClient } from '@prisma/client';

import {
  calculateElectricity,
  calculateRent,
  splitElectricity,
} from '../src/modules/billing/billing.calculations.js';
import {
  addDays,
  currentPeriodKey,
  dueDateFor,
  firstDayOfPeriod,
  fiscalYearOf,
  lastDayOfPeriod,
  todayInZone,
  toPrismaDate,
  type PeriodKey,
} from '../src/lib/dates.js';
import { hashPassword } from '../src/modules/auth/password.js';

const prisma = new PrismaClient();

const SLUG = 'heaven-hospitality-kothrud';
const TIMEZONE = 'Asia/Kolkata';
const DEMO_PASSWORD = 'HeavenDemo#2026';

/** Rent is written in rupees for readability and converted once, on the way in. */
const rupees = (amount: number): number => Math.round(amount * 100);

const today = todayInZone(TIMEZONE);
const thisPeriod = currentPeriodKey(TIMEZONE);

function shiftPeriod(periodKey: PeriodKey, months: number): PeriodKey {
  const [year, month] = periodKey.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const lastPeriod = shiftPeriod(thisPeriod, -1);
const twoPeriodsAgo = shiftPeriod(thisPeriod, -2);

const FLOORS = [
  { name: 'Ground Floor', level: 0 },
  { name: 'First Floor', level: 1 },
  { name: 'Second Floor', level: 2 },
];

const ROOMS = [
  { number: '001', floor: 0, roomType: 'Single', capacity: 1, rent: 14_500, ac: true },
  { number: '002', floor: 0, roomType: '2 Sharing', capacity: 2, rent: 9_500, ac: true },
  { number: '101', floor: 1, roomType: 'Single', capacity: 1, rent: 14_500, ac: true },
  { number: '102', floor: 1, roomType: '2 Sharing', capacity: 2, rent: 9_500, ac: true },
  { number: '103', floor: 1, roomType: '3 Sharing', capacity: 3, rent: 7_000, ac: false },
  { number: '104', floor: 1, roomType: '3 Sharing', capacity: 3, rent: 7_000, ac: false },
  { number: '201', floor: 2, roomType: '3 Sharing', capacity: 3, rent: 7_000, ac: false },
  { number: '202', floor: 2, roomType: '3 Sharing', capacity: 3, rent: 7_000, ac: false },
  { number: '203', floor: 2, roomType: '2 Sharing', capacity: 2, rent: 9_500, ac: true },
];

/** Residents, and where they live. `joinedMonthsAgo` drives their billing history. */
const RESIDENTS = [
  {
    name: 'Vikram Iyer',
    email: 'tenant@heavenhospitality.in',
    phone: '+919000000004',
    room: '103',
    bed: 'A',
    joinedMonthsAgo: 8,
  },
  {
    name: 'Priya Nair',
    email: 'priya@example.in',
    phone: '+919000000005',
    room: '103',
    bed: 'B',
    joinedMonthsAgo: 6,
  },
  {
    name: 'Arjun Rao',
    email: 'arjun@example.in',
    phone: '+919000000006',
    room: '103',
    bed: 'C',
    joinedMonthsAgo: 5,
  },
  {
    name: 'Sneha Kulkarni',
    email: 'sneha@example.in',
    phone: '+919000000007',
    room: '101',
    bed: 'A',
    joinedMonthsAgo: 12,
  },
  {
    name: 'Rohit Sharma',
    email: 'rohit@example.in',
    phone: '+919000000008',
    room: '102',
    bed: 'A',
    joinedMonthsAgo: 4,
  },
  {
    name: 'Ananya Bose',
    email: 'ananya@example.in',
    phone: '+919000000009',
    room: '102',
    bed: 'B',
    joinedMonthsAgo: 3,
    exitsInDays: 21,
  },
  {
    name: 'Karthik Menon',
    email: 'karthik@example.in',
    phone: '+919000000010',
    room: '201',
    bed: 'A',
    joinedMonthsAgo: 9,
  },
  {
    number: 8,
    name: 'Divya Shetty',
    email: 'divya@example.in',
    phone: '+919000000011',
    room: '201',
    bed: 'B',
    joinedMonthsAgo: 2,
  },
  {
    name: 'Imran Qureshi',
    email: 'imran@example.in',
    phone: '+919000000012',
    room: '202',
    bed: 'A',
    joinedMonthsAgo: 7,
    exitsInDays: 45,
  },
  {
    name: 'Meera Joshi',
    email: 'meera@example.in',
    phone: '+919000000013',
    room: '203',
    bed: 'A',
    joinedMonthsAgo: 1,
  },
  {
    name: 'Sanjay Patil',
    email: 'sanjay@example.in',
    phone: '+919000000014',
    room: '001',
    bed: 'A',
    joinedMonthsAgo: 10,
  },
];

const FACILITIES = [
  { label: 'High-speed Wi-Fi', icon: 'wifi' },
  { label: 'Three meals a day', icon: 'utensils' },
  { label: 'Laundry service', icon: 'shirt' },
  { label: 'Housekeeping', icon: 'sparkles' },
  { label: 'Power backup', icon: 'zap' },
  { label: 'CCTV & biometric entry', icon: 'shield' },
  { label: 'Hot water', icon: 'droplet' },
  { label: 'Common study room', icon: 'book' },
];

const RULES = [
  'Entry closes at 11:00 PM. Late entry needs prior intimation to the manager.',
  'Visitors are allowed in the common area until 8:00 PM only.',
  'Rent is due on the 5th of every month.',
  'Smoking and alcohol are not permitted anywhere on the premises.',
  'Please inform the kitchen a day in advance if you will miss a meal.',
  'A one-month notice is required before vacating.',
];

const MENU: Array<[number, MealType, string[]]> = [
  [1, MealType.BREAKFAST, ['Poha', 'Banana', 'Tea']],
  [1, MealType.LUNCH, ['Dal Tadka', 'Jeera Rice', 'Chapati', 'Salad']],
  [1, MealType.DINNER, ['Paneer Butter Masala', 'Chapati', 'Rice']],
  [2, MealType.BREAKFAST, ['Upma', 'Boiled Egg', 'Tea']],
  [2, MealType.LUNCH, ['Rajma', 'Rice', 'Chapati', 'Curd']],
  [2, MealType.DINNER, ['Mix Veg', 'Chapati', 'Dal', 'Rice']],
  [3, MealType.BREAKFAST, ['Idli', 'Sambar', 'Coconut Chutney']],
  [3, MealType.LUNCH, ['Chole', 'Rice', 'Chapati', 'Papad']],
  [3, MealType.DINNER, ['Aloo Gobi', 'Chapati', 'Dal Fry', 'Rice']],
  [4, MealType.BREAKFAST, ['Paratha', 'Curd', 'Tea']],
  [4, MealType.LUNCH, ['Kadhi', 'Rice', 'Chapati', 'Salad']],
  [4, MealType.DINNER, ['Egg Curry / Soya Curry', 'Chapati', 'Rice']],
  [5, MealType.BREAKFAST, ['Sheera', 'Bread Butter', 'Tea']],
  [5, MealType.LUNCH, ['Dal Fry', 'Rice', 'Chapati', 'Pickle']],
  [5, MealType.DINNER, ['Veg Pulao', 'Raita', 'Papad']],
  [6, MealType.BREAKFAST, ['Misal Pav', 'Tea']],
  [6, MealType.LUNCH, ['Sambar', 'Rice', 'Chapati', 'Curd']],
  [6, MealType.DINNER, ['Chicken / Paneer Masala', 'Chapati', 'Rice']],
  [7, MealType.BREAKFAST, ['Dosa', 'Chutney', 'Tea']],
  [7, MealType.LUNCH, ['Veg Biryani', 'Raita', 'Papad']],
  [7, MealType.DINNER, ['Dal Khichdi', 'Kadhi', 'Papad']],
];

async function main(): Promise<void> {
  // A clean slate for the seeded property only. Cascades take the rest.
  await prisma.property.deleteMany({ where: { slug: SLUG } });

  const property = await prisma.property.create({
    data: {
      slug: SLUG,
      name: 'Heaven Hospitality',
      tagline: 'A calmer place to live and study in Kothrud',
      description:
        'Heaven Hospitality is a managed residence for students and working professionals in ' +
        'Kothrud, Pune. Furnished rooms, three home-style meals a day, reliable Wi-Fi and ' +
        'housekeeping — so you can get on with your work.',
      isPubliclyListed: true,
      timezone: TIMEZONE,
      addressLine: 'Plot 14, Mayur Colony',
      locality: 'Kothrud',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411038',
      latitude: '18.507600',
      longitude: '73.807600',
      contactPhone: '+919876543210',
      contactEmail: 'stay@heavenhospitality.in',
      settings: {
        create: {
          rentDueDay: 5,
          graceDays: 3,
          lateFeePerDayPaise: rupees(100),
          lateFeeCapPaise: rupees(3_000),
          electricityRatePaisePerUnit: rupees(13),
          // Placeholders — the owner replaces these in Settings. Not real.
          bankAccountName: 'Heaven Hospitality',
          bankAccountNumber: '000011112222',
          bankIfsc: 'HDFC0001234',
          bankName: 'HDFC Bank',
          upiId: 'heavenhospitality@okhdfcbank',
          upiQrImageUrl: null,
          paymentDetailsArePublic: true,
          mealCutoffLocalTime: '21:00',
        },
      },
      facilities: {
        create: FACILITIES.map((facility, index) => ({ ...facility, sortOrder: index })),
      },
      rules: { create: RULES.map((text, index) => ({ text, sortOrder: index })) },
      menuItems: {
        create: MENU.map(([dayOfWeek, mealType, items]) => ({ dayOfWeek, mealType, items })),
      },
      mealTimings: {
        create: [
          { mealType: MealType.BREAKFAST, startsAt: '08:00', endsAt: '09:30' },
          { mealType: MealType.LUNCH, startsAt: '12:30', endsAt: '14:00' },
          { mealType: MealType.DINNER, startsAt: '20:00', endsAt: '21:30' },
        ],
      },
      notices: {
        create: [
          {
            title: 'Water tank cleaning on Sunday',
            body: 'Supply will be interrupted between 10:00 AM and 1:00 PM this Sunday. Please store water in advance.',
            startsOn: toPrismaDate(addDays(today, -2)),
            endsOn: toPrismaDate(addDays(today, 5)),
            isPinned: true,
          },
          {
            title: 'Rent due on the 5th',
            body: 'A late fee of ₹100/day applies after a 3-day grace period. You can pay from the app.',
            startsOn: toPrismaDate(addDays(today, -10)),
            endsOn: null,
            isPinned: false,
          },
        ],
      },
      staff: {
        create: [
          {
            fullName: 'Ramesh Pawar',
            role: 'Caretaker',
            phone: '+919812345601',
            monthlySalaryPaise: rupees(18_000),
            joinedOn: toPrismaDate(addDays(today, -400)),
          },
          {
            fullName: 'Sunita Kale',
            role: 'Cook',
            phone: '+919812345602',
            monthlySalaryPaise: rupees(16_000),
            joinedOn: toPrismaDate(addDays(today, -250)),
          },
          {
            fullName: 'Anil Gaikwad',
            role: 'Housekeeping',
            phone: '+919812345603',
            monthlySalaryPaise: rupees(12_000),
            joinedOn: toPrismaDate(addDays(today, -120)),
          },
        ],
      },
      inventory: {
        create: [
          {
            name: 'Bed sheets',
            category: 'Linen',
            quantity: 40,
            unitCostPaise: rupees(450),
            purchasedOn: toPrismaDate(addDays(today, -60)),
          },
          {
            name: 'Ceiling fans',
            category: 'Electrical',
            quantity: 12,
            unitCostPaise: rupees(1_800),
            purchasedOn: toPrismaDate(addDays(today, -200)),
          },
          {
            name: 'Gas cylinders',
            category: 'Kitchen',
            quantity: 4,
            unitCostPaise: rupees(1_100),
            purchasedOn: toPrismaDate(addDays(today, -15)),
          },
          {
            name: 'Mattresses',
            category: 'Furniture',
            quantity: 23,
            unitCostPaise: rupees(3_200),
            purchasedOn: toPrismaDate(addDays(today, -365)),
          },
        ],
      },
      expenses: {
        create: [
          {
            title: 'Plumbing repair — 2nd floor',
            category: 'Maintenance',
            amountPaise: rupees(800),
            spentOn: toPrismaDate(addDays(today, -6)),
          },
          {
            title: 'Wi-Fi recharge',
            category: 'Utilities',
            amountPaise: rupees(1_500),
            spentOn: toPrismaDate(addDays(today, -12)),
          },
          {
            title: 'Cleaning supplies',
            category: 'Housekeeping',
            amountPaise: rupees(650),
            spentOn: toPrismaDate(addDays(today, -3)),
          },
          {
            title: 'Vegetables and groceries',
            category: 'Kitchen',
            amountPaise: rupees(9_400),
            spentOn: toPrismaDate(addDays(today, -1)),
          },
        ],
      },
    },
    include: { settings: true },
  });

  const settings = property.settings;
  if (settings === null) throw new Error('Settings were not created');

  // --- Floors, rooms, beds --------------------------------------------------
  const floorIds = new Map<number, string>();
  for (const floor of FLOORS) {
    const created = await prisma.floor.create({
      data: { propertyId: property.id, name: floor.name, level: floor.level },
    });
    floorIds.set(floor.level, created.id);
  }

  const roomIds = new Map<string, string>();
  for (const room of ROOMS) {
    const floorId = floorIds.get(room.floor);
    if (floorId === undefined) throw new Error(`Missing floor ${room.floor}`);

    const created = await prisma.room.create({
      data: {
        propertyId: property.id,
        floorId,
        number: room.number,
        roomType: room.roomType,
        capacity: room.capacity,
        monthlyRentPaise: rupees(room.rent),
        isAirConditioned: room.ac,
        description: room.ac
          ? 'Air-conditioned, attached bathroom.'
          : 'Ceiling fan, common bathroom.',
        facilities: room.ac
          ? ['AC', 'Attached bathroom', 'Study desk']
          : ['Fan', 'Study desk', 'Wardrobe'],
        beds: {
          create: Array.from({ length: room.capacity }, (_unused, index) => ({
            label: String.fromCharCode(65 + index),
          })),
        },
      },
    });
    roomIds.set(room.number, created.id);
  }

  // One bed deliberately out of service, so the occupancy screen shows all three
  // states rather than only occupied/available.
  const maintenanceRoom = roomIds.get('104');
  if (maintenanceRoom !== undefined) {
    const bed = await prisma.bed.findFirst({ where: { roomId: maintenanceRoom, label: 'C' } });
    if (bed !== null) {
      await prisma.bed.update({ where: { id: bed.id }, data: { status: 'MAINTENANCE' } });
    }
  }

  // --- Owner ----------------------------------------------------------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@heavenhospitality.in' },
    update: { fullName: 'Asha Menon', passwordHash, status: 'ACTIVE' },
    create: {
      fullName: 'Asha Menon',
      email: 'owner@heavenhospitality.in',
      phone: '+919000000001',
      passwordHash,
      status: 'ACTIVE',
    },
  });

  await prisma.propertyMembership.create({
    data: { userId: owner.id, propertyId: property.id, role: MembershipRole.OWNER },
  });

  // --- Residents ------------------------------------------------------------
  const tenancyIds: Array<{ id: string; name: string; rent: number; joinedOn: string }> = [];

  for (const resident of RESIDENTS) {
    const roomId = roomIds.get(resident.room);
    if (roomId === undefined) throw new Error(`Missing room ${resident.room}`);

    const bed = await prisma.bed.findFirst({ where: { roomId, label: resident.bed } });
    if (bed === null) throw new Error(`Missing bed ${resident.room}/${resident.bed}`);

    const roomConfig = ROOMS.find((room) => room.number === resident.room);
    if (roomConfig === undefined) throw new Error(`Missing room config ${resident.room}`);

    const joinedOn = addDays(today, -resident.joinedMonthsAgo * 30);

    const user = await prisma.user.upsert({
      where: { email: resident.email },
      update: { fullName: resident.name, phone: resident.phone, passwordHash, status: 'ACTIVE' },
      create: {
        fullName: resident.name,
        email: resident.email,
        phone: resident.phone,
        passwordHash,
        status: 'ACTIVE',
      },
    });

    await prisma.propertyMembership.create({
      data: { userId: user.id, propertyId: property.id, role: MembershipRole.RESIDENT },
    });

    const tenancy = await prisma.tenancy.create({
      data: {
        propertyId: property.id,
        userId: user.id,
        status: 'ACTIVE',
        joiningDate: toPrismaDate(joinedOn),
        expectedExitDate:
          resident.exitsInDays === undefined
            ? null
            : toPrismaDate(addDays(today, resident.exitsInDays)),
        securityDepositPaise: rupees(roomConfig.rent * 2),
        emergencyContactName: 'Family contact',
        emergencyContactPhone: '+919800000000',
      },
    });

    await prisma.allocation.create({
      data: {
        tenancyId: tenancy.id,
        bedId: bed.id,
        startedAt: toPrismaDate(joinedOn),
        reason: 'Move-in',
      },
    });
    await prisma.bed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });

    tenancyIds.push({
      id: tenancy.id,
      name: resident.name,
      rent: rupees(roomConfig.rent),
      joinedOn,
    });
  }

  // --- Electricity ----------------------------------------------------------
  // A reading for each occupied room in the last two periods, so bills have a
  // real electricity line rather than rent alone.
  let meterBase = 12_000;
  for (const [number, roomId] of roomIds) {
    const occupied = await prisma.allocation.count({ where: { bed: { roomId }, endedAt: null } });
    if (occupied === 0) continue;

    for (const period of [twoPeriodsAgo, lastPeriod]) {
      const previous = meterBase;
      const current = previous + 40 + Math.floor(Math.random() * 50);
      meterBase = current;

      const { units, amountPaise } = calculateElectricity({
        previousReading: previous,
        currentReading: current,
        ratePaisePerUnit: settings.electricityRatePaisePerUnit,
      });

      const reading = await prisma.meterReading.create({
        data: {
          propertyId: property.id,
          roomId,
          periodKey: period,
          previousReading: previous,
          currentReading: current,
          units,
          ratePaisePerUnit: settings.electricityRatePaisePerUnit,
          amountPaise,
          readingDate: toPrismaDate(lastDayOfPeriod(period)),
          recordedByUserId: owner.id,
          notes: `Room ${number}`,
        },
      });

      const allocations = await prisma.allocation.findMany({
        where: { bed: { roomId } },
        select: { tenancyId: true, startedAt: true, endedAt: true },
      });

      const shares = splitElectricity(
        amountPaise,
        period,
        allocations.map((allocation) => ({
          tenancyId: allocation.tenancyId,
          startedOn: allocation.startedAt.toISOString().slice(0, 10),
          endedOn: allocation.endedAt?.toISOString().slice(0, 10) ?? null,
        })),
      );

      for (const share of shares.filter((entry) => entry.occupiedDays > 0)) {
        await prisma.electricityShare.create({
          data: {
            readingId: reading.id,
            tenancyId: share.tenancyId,
            sharePaise: share.sharePaise,
            occupiedDays: share.occupiedDays,
          },
        });
      }
    }
  }

  // --- Invoices, in every state --------------------------------------------
  let invoiceSequence = 0;
  let receiptSequence = 0;

  for (const period of [twoPeriodsAgo, lastPeriod, thisPeriod]) {
    for (const tenancy of tenancyIds) {
      const rent = calculateRent({
        periodKey: period,
        monthlyRentPaise: tenancy.rent,
        joiningDate: tenancy.joinedOn,
        exitDate: null,
      });
      if (rent.amountPaise === 0) continue;

      const electricity = await prisma.electricityShare.findMany({
        where: { tenancyId: tenancy.id, reading: { periodKey: period } },
        include: {
          reading: {
            select: { units: true, ratePaisePerUnit: true, room: { select: { number: true } } },
          },
        },
      });

      const electricityTotal = electricity.reduce((sum, share) => sum + share.sharePaise, 0);
      const total = rent.amountPaise + electricityTotal;

      invoiceSequence += 1;
      const dueDate = dueDateFor(period, settings.rentDueDay);

      // Two periods ago: paid. Last period: left unpaid so it shows as overdue.
      // This period: issued and not yet due.
      const isPaid = period === twoPeriodsAgo;
      const isOverdue = period === lastPeriod;

      const invoice = await prisma.invoice.create({
        data: {
          propertyId: property.id,
          tenancyId: tenancy.id,
          periodKey: period,
          number: `INV-${period.replace('-', '')}-${String(invoiceSequence).padStart(4, '0')}`,
          status: isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : 'ISSUED',
          issueDate: toPrismaDate(firstDayOfPeriod(period)),
          dueDate: toPrismaDate(dueDate),
          totalPaise: total,
          amountPaidPaise: isPaid ? total : 0,
          items: {
            create: [
              {
                kind: 'RENT',
                description: rent.isProrated
                  ? `Room rent — ${rent.occupiedDays} of ${rent.daysInPeriod} days`
                  : 'Room rent',
                amountPaise: rent.amountPaise,
              },
              ...electricity.map((share) => ({
                kind: 'ELECTRICITY' as const,
                description: `Electricity — room ${share.reading.room.number}, ${share.reading.units} units @ ₹${(share.reading.ratePaisePerUnit / 100).toFixed(2)}/unit`,
                amountPaise: share.sharePaise,
                sourceType: 'ElectricityShare',
                sourceId: share.id,
              })),
            ],
          },
        },
      });

      if (isPaid) {
        receiptSequence += 1;
        const paidOn = addDays(dueDate, -1);
        const fiscalYear = fiscalYearOf(paidOn);

        const payment = await prisma.payment.create({
          data: {
            propertyId: property.id,
            tenancyId: tenancy.id,
            amountPaise: total,
            method:
              receiptSequence % 3 === 0
                ? 'CASH'
                : receiptSequence % 3 === 1
                  ? 'UPI'
                  : 'BANK_TRANSFER',
            status: 'PAID',
            paidAt: toPrismaDate(paidOn),
            reference: receiptSequence % 3 === 1 ? `UPI${String(100000 + receiptSequence)}` : null,
            recordedByUserId: owner.id,
            unallocatedPaise: 0,
            allocations: { create: { invoiceId: invoice.id, amountPaise: total } },
          },
        });

        await prisma.receiptSequence.upsert({
          where: { propertyId_fiscalYear: { propertyId: property.id, fiscalYear } },
          update: { lastNumber: receiptSequence },
          create: { propertyId: property.id, fiscalYear, lastNumber: receiptSequence },
        });

        await prisma.receipt.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            number: `HH/${fiscalYear}/${String(receiptSequence).padStart(4, '0')}`,
            snapshot: {
              propertyName: property.name,
              residentName: tenancy.name,
              roomNumber: null,
              periodKey: period,
              method: payment.method,
              paidOn,
              totalPaidPaise: total,
              unallocatedPaise: 0,
              lines: [{ label: 'Room rent', amountPaise: rent.amountPaise }],
            },
          },
        });
      }
    }
  }

  // One partially-paid invoice, so that state is represented too.
  const partial = await prisma.invoice.findFirst({
    where: { propertyId: property.id, periodKey: lastPeriod, status: 'OVERDUE' },
  });
  if (partial !== null) {
    const half = Math.floor(partial.totalPaise / 2);
    const payment = await prisma.payment.create({
      data: {
        propertyId: property.id,
        tenancyId: partial.tenancyId,
        amountPaise: half,
        method: 'UPI',
        status: 'PAID',
        paidAt: toPrismaDate(addDays(today, -4)),
        reference: 'UPI998877',
        recordedByUserId: owner.id,
        allocations: { create: { invoiceId: partial.id, amountPaise: half } },
      },
    });
    await prisma.invoice.update({
      where: { id: partial.id },
      data: { amountPaidPaise: half },
    });
    void payment;
  }

  // --- Meal absences, so today's counts are not simply "everyone" -----------
  const someResidents = tenancyIds.slice(0, 3);
  for (const [index, tenancy] of someResidents.entries()) {
    await prisma.mealAbsence.create({
      data: {
        tenancyId: tenancy.id,
        date: toPrismaDate(today),
        mealType: index === 0 ? MealType.BREAKFAST : index === 1 ? MealType.LUNCH : MealType.DINNER,
      },
    });
  }

  // --- Complaints, across categories and states ----------------------------
  const complaintSeeds = [
    {
      title: 'Tap leaking in bathroom',
      category: 'PLUMBING' as const,
      status: 'OPEN' as const,
      description: 'The wash basin tap has been dripping since yesterday.',
    },
    {
      title: 'Wi-Fi very slow in the evening',
      category: 'WIFI' as const,
      status: 'IN_PROGRESS' as const,
      description: 'Between 8pm and 11pm the connection is almost unusable.',
    },
    {
      title: 'Tube light not working',
      category: 'ELECTRICAL' as const,
      status: 'RESOLVED' as const,
      description: 'The tube light near the study desk stopped working.',
    },
    {
      title: 'AC not cooling',
      category: 'AC' as const,
      status: 'OPEN' as const,
      description: 'The AC runs but the room does not get cold.',
    },
    {
      title: 'Cupboard door hinge broken',
      category: 'CARPENTER' as const,
      status: 'CLOSED' as const,
      description: 'The left door of the wardrobe is hanging loose.',
    },
  ];

  for (const [index, seed] of complaintSeeds.entries()) {
    const tenancy = tenancyIds[index % tenancyIds.length];
    if (tenancy === undefined) continue;

    const record = await prisma.tenancy.findUniqueOrThrow({
      where: { id: tenancy.id },
      select: { userId: true },
    });

    await prisma.complaint.create({
      data: {
        propertyId: property.id,
        raisedByUserId: record.userId,
        tenancyId: tenancy.id,
        title: seed.title,
        description: seed.description,
        category: seed.category,
        status: seed.status,
        resolvedAt: seed.status === 'RESOLVED' ? new Date() : null,
        createdAt: new Date(Date.now() - index * 86_400_000),
        events: {
          create: [
            { toStatus: 'OPEN', note: 'Complaint raised', actorUserId: record.userId },
            ...(seed.status === 'OPEN'
              ? []
              : [
                  {
                    fromStatus: 'OPEN' as const,
                    toStatus: seed.status,
                    note: 'Updated by owner',
                    actorUserId: owner.id,
                  },
                ]),
          ],
        },
      },
    });
  }

  // --- Reminder log (mock provider) ----------------------------------------
  const overdueInvoices = await prisma.invoice.findMany({
    where: { propertyId: property.id, status: 'OVERDUE' },
    take: 3,
    include: { tenancy: { include: { user: { select: { fullName: true } } } } },
  });

  for (const invoice of overdueInvoices) {
    await prisma.reminderEvent.create({
      data: {
        propertyId: property.id,
        invoiceId: invoice.id,
        tenancyId: invoice.tenancyId,
        kind: 'AFTER_DUE',
        channel: 'WHATSAPP',
        status: 'SENT',
        dedupeKey: `rent:${invoice.tenancyId}:${invoice.periodKey}:AFTER_DUE`,
        message: `Reminder: ₹${(invoice.totalPaise / 100).toFixed(2)} for ${invoice.periodKey} is overdue.`,
        sentAt: new Date(),
        attempts: 1,
      },
    });
  }

  // --- Activity feed --------------------------------------------------------
  // A few audit entries so the dashboard's recent activity is not empty on a
  // fresh install. Real entries are written by the services as the owner works.
  const feed: Array<
    [Parameters<typeof prisma.auditLog.create>[0]['data']['action'], string, number]
  > = [
    ['RESIDENT_ADDED', 'Meera Joshi added as a resident', 1],
    ['PAYMENT_RECORDED', 'Payment received from Sneha Kulkarni via UPI', 2],
    ['ELECTRICITY_READING_ADDED', `Room 103 ${lastPeriod}: meter reading recorded`, 3],
    ['COMPLAINT_RAISED', 'Vikram Iyer raised "Tap leaking in bathroom"', 1],
    ['INVOICE_ISSUED', `Invoices issued for ${thisPeriod}`, 4],
    ['ROOM_CREATED', 'Room 203 created with 2 beds', 6],
  ];

  for (const [action, summary, daysAgo] of feed) {
    await prisma.auditLog.create({
      data: {
        action,
        entityType: 'Seed',
        propertyId: property.id,
        summary,
        actorUserId: owner.id,
        actorRole: 'OWNER',
        createdAt: new Date(Date.now() - daysAgo * 86_400_000),
      },
    });
  }

  // --- Summary --------------------------------------------------------------
  const [rooms, beds, available, residents, invoices, complaints] = await Promise.all([
    prisma.room.count({ where: { propertyId: property.id } }),
    prisma.bed.count({ where: { room: { propertyId: property.id } } }),
    prisma.bed.count({ where: { room: { propertyId: property.id }, status: 'AVAILABLE' } }),
    prisma.tenancy.count({ where: { propertyId: property.id, status: 'ACTIVE' } }),
    prisma.invoice.count({ where: { propertyId: property.id } }),
    prisma.complaint.count({ where: { propertyId: property.id } }),
  ]);

  const lines = [
    `Seeded "${property.name}" (${SLUG})`,
    `  ${FLOORS.length} floors · ${rooms} rooms · ${beds} beds (${available} available)`,
    `  ${residents} residents · ${invoices} invoices · ${complaints} complaints`,
    `  Billing periods: ${twoPeriodsAgo} (paid) · ${lastPeriod} (overdue) · ${thisPeriod} (issued)`,
    '',
    '  Sign in — DEVELOPMENT ONLY. Password for every account:',
    `    ${DEMO_PASSWORD}`,
    '    OWNER     owner@heavenhospitality.in     (admin console)',
    '    RESIDENT  tenant@heavenhospitality.in    (mobile app)',
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
