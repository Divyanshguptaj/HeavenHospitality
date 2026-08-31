import type {
  AttendanceStatusName,
  BedStatusName,
  ComplaintCategoryName,
  ComplaintStatusName,
  InvoiceItemKindName,
  InvoiceStatusName,
  MealTypeName,
  PaymentMethodName,
  PaymentStatusName,
  RoomStatusName,
  TenancyStatusName,
} from './domain.js';

/**
 * Authenticated response shapes.
 *
 * These are the DTOs the API returns — never Prisma models. Every field here is
 * deliberate, which is what stops a new database column silently widening an
 * endpoint.
 *
 * Money is always integer paise; clients format it.
 */

export interface SettingsView {
  readonly property: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly tagline: string | null;
    readonly description: string | null;
    readonly addressLine: string;
    readonly locality: string;
    readonly city: string;
    readonly state: string;
    readonly pincode: string;
    readonly contactPhone: string;
    readonly contactEmail: string | null;
    readonly isPubliclyListed: boolean;
    readonly timezone: string;
  };
  readonly financial: {
    readonly rentDueDay: number;
    readonly graceDays: number;
    readonly lateFeePerDayPaise: number;
    readonly lateFeeCapPaise: number;
    readonly electricityRatePaisePerUnit: number;
  };
  readonly payment: {
    readonly bankAccountName: string | null;
    readonly bankAccountNumber: string | null;
    readonly bankIfsc: string | null;
    readonly bankName: string | null;
    readonly upiId: string | null;
    readonly upiQrImageUrl: string | null;
    readonly showBankDetailsPublicly: boolean;
    readonly showUpiPublicly: boolean;
  };
  readonly mess: {
    readonly mealCutoffLocalTime: string;
    readonly timings: ReadonlyArray<{
      readonly mealType: MealTypeName;
      readonly startsAt: string;
      readonly endsAt: string;
    }>;
  };
}

export interface BedView {
  readonly id: string;
  readonly label: string;
  readonly status: BedStatusName;
  /** Present only when occupied — this is owner-facing data. */
  readonly occupant: {
    readonly tenancyId: string;
    readonly residentName: string;
    readonly expectedExitDate: string | null;
  } | null;
}

export interface RoomView {
  readonly id: string;
  readonly number: string;
  readonly roomType: string;
  readonly capacity: number;
  readonly monthlyRentPaise: number;
  readonly isAirConditioned: boolean;
  readonly description: string | null;
  readonly facilities: readonly string[];
  readonly status: RoomStatusName;
  readonly floor: { readonly id: string; readonly name: string; readonly level: number };
  readonly beds: readonly BedView[];
  readonly occupiedBeds: number;
  readonly availableBeds: number;
}

export interface FloorView {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly roomCount: number;
  readonly bedCount: number;
  readonly occupiedBeds: number;
  /** False when the floor still has rooms, so the UI can explain why. */
  readonly canDelete: boolean;
}

export interface ResidentSummaryView {
  readonly tenancyId: string;
  readonly userId: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly status: TenancyStatusName;
  readonly joiningDate: string;
  readonly expectedExitDate: string | null;
  readonly bed: {
    readonly bedId: string;
    readonly bedLabel: string;
    readonly roomId: string;
    readonly roomNumber: string;
    readonly floorName: string;
  } | null;
  readonly monthlyRentPaise: number;
  readonly outstandingPaise: number;
}

export interface ResidentDetailView extends ResidentSummaryView {
  readonly securityDepositPaise: number;
  readonly monthlyRentOverridePaise: number | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly actualExitDate: string | null;
  readonly invoices: readonly InvoiceSummaryView[];
  readonly payments: readonly PaymentView[];
  readonly electricity: ReadonlyArray<{
    readonly periodKey: string;
    readonly units: number;
    readonly ratePaisePerUnit: number;
    readonly sharePaise: number;
    readonly occupiedDays: number;
    readonly roomNumber: string;
  }>;
  readonly complaints: readonly ComplaintSummaryView[];
}

export interface InvoiceItemView {
  readonly id: string;
  readonly kind: InvoiceItemKindName;
  readonly description: string;
  readonly amountPaise: number;
}

export interface InvoiceSummaryView {
  readonly id: string;
  readonly number: string;
  readonly periodKey: string;
  readonly status: InvoiceStatusName;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly totalPaise: number;
  readonly amountPaidPaise: number;
  readonly outstandingPaise: number;
  readonly residentName: string;
  readonly roomNumber: string | null;
  readonly tenancyId: string;
}

export interface InvoiceDetailView extends InvoiceSummaryView {
  readonly items: readonly InvoiceItemView[];
  readonly lateFeeWaivedAt: string | null;
  readonly payments: readonly PaymentView[];
  readonly notes: string | null;
}

export interface PaymentView {
  readonly id: string;
  readonly amountPaise: number;
  readonly method: PaymentMethodName;
  readonly status: PaymentStatusName;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
  readonly residentName: string;
  readonly tenancyId: string;
  readonly receiptNumber: string | null;
  readonly unallocatedPaise: number;
}

export interface ReceiptView {
  readonly id: string;
  readonly number: string;
  readonly issuedAt: string;
  readonly propertyName: string;
  readonly residentName: string;
  readonly roomNumber: string | null;
  readonly periodKey: string | null;
  readonly method: PaymentMethodName;
  readonly totalPaidPaise: number;
  readonly lines: ReadonlyArray<{ readonly label: string; readonly amountPaise: number }>;
}

export interface MeterReadingView {
  readonly id: string;
  readonly roomId: string;
  readonly roomNumber: string;
  readonly periodKey: string;
  readonly previousReading: number;
  readonly currentReading: number;
  readonly units: number;
  readonly ratePaisePerUnit: number;
  readonly amountPaise: number;
  readonly readingDate: string;
  readonly status: 'ACTIVE' | 'CORRECTED';
  readonly shares: ReadonlyArray<{
    readonly tenancyId: string;
    readonly residentName: string;
    readonly sharePaise: number;
    readonly occupiedDays: number;
  }>;
}

export interface MenuDayView {
  readonly dayOfWeek: number;
  readonly meals: ReadonlyArray<{
    readonly mealType: MealTypeName;
    readonly items: readonly string[];
  }>;
}

export interface MealCountView {
  readonly date: string;
  readonly counts: ReadonlyArray<{
    readonly mealType: MealTypeName;
    readonly expected: number;
    readonly absent: number;
  }>;
  readonly totalActiveResidents: number;
}

export interface ComplaintSummaryView {
  readonly id: string;
  readonly title: string;
  readonly category: ComplaintCategoryName;
  readonly status: ComplaintStatusName;
  readonly createdAt: string;
  readonly residentName: string;
  readonly roomNumber: string | null;
}

export interface ComplaintDetailView extends ComplaintSummaryView {
  readonly description: string;
  readonly imageUrl: string | null;
  readonly reopenCount: number;
  readonly events: ReadonlyArray<{
    readonly id: string;
    readonly fromStatus: ComplaintStatusName | null;
    readonly toStatus: ComplaintStatusName | null;
    readonly note: string | null;
    readonly createdAt: string;
    readonly actorName: string | null;
  }>;
}

export interface NoticeView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly isPinned: boolean;
}

export interface OccupancyView {
  readonly totals: {
    readonly rooms: number;
    readonly beds: number;
    readonly occupied: number;
    readonly available: number;
    readonly unavailable: number;
    readonly occupancyRate: number;
  };
  readonly floors: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly level: number;
    readonly rooms: readonly RoomView[];
  }>;
  readonly upcomingVacancies: ReadonlyArray<{
    readonly tenancyId: string;
    readonly residentName: string;
    readonly roomNumber: string;
    readonly bedLabel: string;
    readonly expectedExitDate: string;
    readonly daysRemaining: number;
  }>;
}

export interface DashboardView {
  readonly occupancy: {
    readonly totalRooms: number;
    readonly totalBeds: number;
    readonly occupiedBeds: number;
    readonly availableBeds: number;
    readonly totalResidents: number;
  };
  readonly money: {
    readonly periodKey: string;
    readonly expectedPaise: number;
    readonly collectedPaise: number;
    readonly pendingPaise: number;
    readonly overdueInvoiceCount: number;
  };
  readonly unpaidResidents: ReadonlyArray<{
    readonly tenancyId: string;
    readonly residentName: string;
    readonly roomNumber: string | null;
    readonly outstandingPaise: number;
    readonly status: InvoiceStatusName;
    readonly dueDate: string;
  }>;
  readonly meals: MealCountView;
  readonly openComplaints: number;
  readonly upcomingVacancies: ReadonlyArray<{
    readonly residentName: string;
    readonly roomNumber: string;
    readonly bedLabel: string;
    readonly expectedExitDate: string;
    readonly daysRemaining: number;
  }>;
  readonly recentActivity: ReadonlyArray<{
    readonly id: string;
    readonly action: string;
    readonly summary: string;
    readonly actorName: string | null;
    readonly createdAt: string;
  }>;
}

/** What a signed-in resident sees on their home screen. */
export interface ResidentHomeView {
  readonly resident: {
    readonly tenancyId: string;
    readonly fullName: string;
    readonly status: TenancyStatusName;
    readonly joiningDate: string;
  };
  readonly placement: {
    readonly roomNumber: string;
    readonly roomType: string;
    readonly bedLabel: string;
    readonly floorName: string;
    readonly isAirConditioned: boolean;
  } | null;
  readonly currentInvoice: InvoiceDetailView | null;
  readonly outstandingPaise: number;
  readonly todaysMenu: ReadonlyArray<{
    readonly mealType: MealTypeName;
    readonly items: readonly string[];
    readonly startsAt: string | null;
    readonly endsAt: string | null;
    readonly isAbsent: boolean;
  }>;
  readonly notices: readonly NoticeView[];
  readonly complaints: {
    readonly open: number;
    readonly inProgress: number;
    readonly resolved: number;
  };
}

export interface StaffView {
  readonly id: string;
  readonly fullName: string;
  readonly role: string;
  readonly phone: string | null;
  readonly monthlySalaryPaise: number | null;
  readonly isActive: boolean;
  readonly joinedOn: string;
  readonly todayStatus: AttendanceStatusName | null;
  readonly presentDaysThisMonth: number;
}

export interface InventoryItemView {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly quantity: number;
  readonly unitCostPaise: number | null;
  readonly purchasedOn: string | null;
  readonly notes: string | null;
}

export interface ExpenseView {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly amountPaise: number;
  readonly spentOn: string;
  readonly notes: string | null;
}

export interface ReminderEventView {
  readonly id: string;
  readonly kind: 'BEFORE_DUE' | 'ON_DUE' | 'AFTER_DUE';
  readonly channel: 'IN_APP' | 'WHATSAPP' | 'EMAIL';
  readonly status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  readonly message: string;
  readonly createdAt: string;
  readonly sentAt: string | null;
}
