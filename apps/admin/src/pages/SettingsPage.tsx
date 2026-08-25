import { useState } from 'react';

import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  Select,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import { useSettings, useUpdatePropertyProfile, useUpdateSettings } from '../lib/ownerApi';

/**
 * Settings.
 *
 * Everything the business rules depend on lives here rather than in code: the
 * rent due day, the grace period, the late fee and its cap, and the electricity
 * rate. Changing a rate affects FUTURE calculations only — issued invoices keep
 * the rate they were generated with.
 */
export function SettingsPage() {
  const settings = useSettings();

  if (settings.isPending) {
    return (
      <>
        <PageHeader title="Settings" />
        <LoadingRows rows={8} />
      </>
    );
  }

  if (settings.error) {
    return (
      <>
        <PageHeader title="Settings" />
        <Card>
          <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Financial rules, payment details and the information guests see."
      />

      <div className="flex flex-col gap-4">
        <FinancialSection settings={settings.data} />
        <PaymentSection settings={settings.data} />
        <PropertySection settings={settings.data} />
      </div>
    </>
  );
}

type Settings = NonNullable<ReturnType<typeof useSettings>['data']>;

function SaveRow({
  dirty,
  busy,
  error,
  onSave,
}: {
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSave: () => void;
}) {
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-[var(--color-border)] pt-3">
      <Button variant="primary" onClick={onSave} disabled={!dirty || busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </Button>
      {error !== null && (
        <span role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </span>
      )}
      {!dirty && !busy && error === null && (
        <span className="text-sm text-[var(--color-text-muted)]">No unsaved changes</span>
      )}
    </div>
  );
}

function FinancialSection({ settings }: { readonly settings: Settings }) {
  const update = useUpdateSettings();
  const initial = {
    rentDueDay: String(settings.financial.rentDueDay),
    graceDays: String(settings.financial.graceDays),
    lateFeePerDay: String(settings.financial.lateFeePerDayPaise / 100),
    lateFeeCap: String(settings.financial.lateFeeCapPaise / 100),
    electricityRate: String(settings.financial.electricityRatePaisePerUnit / 100),
  };

  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  async function save(): Promise<void> {
    setError(null);
    try {
      await update.mutateAsync({
        rentDueDay: Number(form.rentDueDay),
        graceDays: Number(form.graceDays),
        lateFeePerDayPaise: Math.round(Number(form.lateFeePerDay) * 100),
        lateFeeCapPaise: Math.round(Number(form.lateFeeCap) * 100),
        electricityRatePaisePerUnit: Math.round(Number(form.electricityRate) * 100),
      });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <Card title="Financial rules">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Rent due day"
          htmlFor="rent-due-day"
          hint="1–28, so the date exists in every month."
        >
          <Select
            id="rent-due-day"
            value={form.rentDueDay}
            onChange={(event) => setForm({ ...form, rentDueDay: event.target.value })}
          >
            {Array.from({ length: 28 }, (_unused, index) => index + 1).map((day) => (
              <option key={day} value={String(day)}>
                {day}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Grace period (days)"
          htmlFor="grace-days"
          hint="No late fee accrues during this window."
        >
          <Input
            id="grace-days"
            type="number"
            min={0}
            max={31}
            value={form.graceDays}
            onChange={(event) => setForm({ ...form, graceDays: event.target.value })}
          />
        </Field>

        <Field label="Late fee per day (₹)" htmlFor="late-fee">
          <Input
            id="late-fee"
            type="number"
            min={0}
            value={form.lateFeePerDay}
            onChange={(event) => setForm({ ...form, lateFeePerDay: event.target.value })}
          />
        </Field>

        <Field
          label="Late fee cap (₹)"
          htmlFor="late-fee-cap"
          hint="The most a single invoice can accrue."
        >
          <Input
            id="late-fee-cap"
            type="number"
            min={0}
            value={form.lateFeeCap}
            onChange={(event) => setForm({ ...form, lateFeeCap: event.target.value })}
          />
        </Field>

        <Field
          label="Electricity rate (₹/unit)"
          htmlFor="electricity-rate"
          hint="Applies to new readings only; issued bills keep their rate."
        >
          <Input
            id="electricity-rate"
            type="number"
            min={0}
            step="0.01"
            value={form.electricityRate}
            onChange={(event) => setForm({ ...form, electricityRate: event.target.value })}
          />
        </Field>
      </div>

      <SaveRow dirty={dirty} busy={update.isPending} error={error} onSave={() => void save()} />
    </Card>
  );
}

function PaymentSection({ settings }: { readonly settings: Settings }) {
  const update = useUpdateSettings();
  const initial = {
    bankAccountName: settings.payment.bankAccountName ?? '',
    bankAccountNumber: settings.payment.bankAccountNumber ?? '',
    bankIfsc: settings.payment.bankIfsc ?? '',
    bankName: settings.payment.bankName ?? '',
    upiId: settings.payment.upiId ?? '',
    upiQrImageUrl: settings.payment.upiQrImageUrl ?? '',
    paymentDetailsArePublic: settings.payment.paymentDetailsArePublic,
  };

  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  async function save(): Promise<void> {
    setError(null);
    const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

    try {
      await update.mutateAsync({
        bankAccountName: orNull(form.bankAccountName),
        bankAccountNumber: orNull(form.bankAccountNumber),
        bankIfsc: orNull(form.bankIfsc),
        bankName: orNull(form.bankName),
        upiId: orNull(form.upiId),
        upiQrImageUrl: orNull(form.upiQrImageUrl),
        paymentDetailsArePublic: form.paymentDetailsArePublic,
      });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <Card title="Payment details">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account holder" htmlFor="bank-name-holder">
          <Input
            id="bank-name-holder"
            value={form.bankAccountName}
            onChange={(event) => setForm({ ...form, bankAccountName: event.target.value })}
          />
        </Field>
        <Field label="Bank" htmlFor="bank-name">
          <Input
            id="bank-name"
            value={form.bankName}
            onChange={(event) => setForm({ ...form, bankName: event.target.value })}
          />
        </Field>
        <Field label="Account number" htmlFor="bank-account">
          <Input
            id="bank-account"
            value={form.bankAccountNumber}
            onChange={(event) => setForm({ ...form, bankAccountNumber: event.target.value })}
          />
        </Field>
        <Field label="IFSC" htmlFor="bank-ifsc">
          <Input
            id="bank-ifsc"
            value={form.bankIfsc}
            onChange={(event) => setForm({ ...form, bankIfsc: event.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="UPI ID" htmlFor="upi-id">
          <Input
            id="upi-id"
            value={form.upiId}
            onChange={(event) => setForm({ ...form, upiId: event.target.value })}
            placeholder="name@bank"
          />
        </Field>
        <Field label="UPI QR image URL" htmlFor="upi-qr" hint="Optional. Shown to residents.">
          <Input
            id="upi-qr"
            value={form.upiQrImageUrl}
            onChange={(event) => setForm({ ...form, upiQrImageUrl: event.target.value })}
          />
        </Field>

        <label className="flex items-start gap-2 text-sm text-[var(--color-text-primary)] sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.paymentDetailsArePublic}
            onChange={(event) =>
              setForm({ ...form, paymentDetailsArePublic: event.target.checked })
            }
          />
          <span>
            Show these to guests as well as residents
            <span className="block text-xs text-[var(--color-text-muted)]">
              Residents always see them. Tick this only if you want anyone browsing the app to see
              your account details too.
            </span>
          </span>
        </label>
      </div>

      <SaveRow dirty={dirty} busy={update.isPending} error={error} onSave={() => void save()} />
    </Card>
  );
}

function PropertySection({ settings }: { readonly settings: Settings }) {
  const update = useUpdatePropertyProfile();
  const initial = {
    name: settings.property.name,
    tagline: settings.property.tagline ?? '',
    description: settings.property.description ?? '',
    addressLine: settings.property.addressLine,
    locality: settings.property.locality,
    city: settings.property.city,
    state: settings.property.state,
    pincode: settings.property.pincode,
    contactPhone: settings.property.contactPhone,
    contactEmail: settings.property.contactEmail ?? '',
    isPubliclyListed: settings.property.isPubliclyListed,
  };

  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  async function save(): Promise<void> {
    setError(null);
    try {
      await update.mutateAsync({
        ...form,
        tagline: form.tagline.trim() === '' ? null : form.tagline.trim(),
        description: form.description.trim() === '' ? null : form.description.trim(),
        contactEmail: form.contactEmail.trim() === '' ? null : form.contactEmail.trim(),
      });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not save.');
    }
  }

  return (
    <Card title="Property details (shown to guests)">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="property-name">
          <Input
            id="property-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Tagline" htmlFor="property-tagline">
          <Input
            id="property-tagline"
            value={form.tagline}
            onChange={(event) => setForm({ ...form, tagline: event.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="property-description">
            <Input
              id="property-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="property-address">
          <Input
            id="property-address"
            value={form.addressLine}
            onChange={(event) => setForm({ ...form, addressLine: event.target.value })}
          />
        </Field>
        <Field label="Locality" htmlFor="property-locality">
          <Input
            id="property-locality"
            value={form.locality}
            onChange={(event) => setForm({ ...form, locality: event.target.value })}
          />
        </Field>
        <Field label="City" htmlFor="property-city">
          <Input
            id="property-city"
            value={form.city}
            onChange={(event) => setForm({ ...form, city: event.target.value })}
          />
        </Field>
        <Field label="State" htmlFor="property-state">
          <Input
            id="property-state"
            value={form.state}
            onChange={(event) => setForm({ ...form, state: event.target.value })}
          />
        </Field>
        <Field label="Pincode" htmlFor="property-pincode">
          <Input
            id="property-pincode"
            value={form.pincode}
            onChange={(event) => setForm({ ...form, pincode: event.target.value })}
          />
        </Field>
        <Field label="Contact phone" htmlFor="property-phone">
          <Input
            id="property-phone"
            value={form.contactPhone}
            onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
          />
        </Field>
        <Field label="Contact email" htmlFor="property-email">
          <Input
            id="property-email"
            value={form.contactEmail}
            onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isPubliclyListed}
            onChange={(event) => setForm({ ...form, isPubliclyListed: event.target.checked })}
          />
          List publicly in the guest app
        </label>
      </div>

      <SaveRow dirty={dirty} busy={update.isPending} error={error} onSave={() => void save()} />
    </Card>
  );
}
