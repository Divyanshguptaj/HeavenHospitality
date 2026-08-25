import { formatINR } from '@heaven/money';
import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  Select,
  StatTile,
  Table,
  Td,
  Th,
  formatDate,
} from '../components/ui';
import { ApiRequestError } from '../lib/apiClient';
import {
  useCreateExpense,
  useCreateInventoryItem,
  useCreateStaff,
  useDeleteExpense,
  useDeleteInventoryItem,
  useExpenses,
  useInventory,
  useMarkStaffAttendance,
  useReminders,
  useStaff,
} from '../lib/ownerApi';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

type Tab = 'staff' | 'inventory' | 'expenses' | 'reminders';

/**
 * Supporting operations: staff attendance, inventory, expenses and the reminder
 * log. Deliberately simple — enough that the owner does not need a second app,
 * without becoming a payroll or stock system.
 */
export function OperationsPage() {
  const [tab, setTab] = useState<Tab>('staff');

  const tabs: ReadonlyArray<{ id: Tab; label: string }> = [
    { id: 'staff', label: 'Staff' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'reminders', label: 'Reminders' },
  ];

  return (
    <>
      <PageHeader title="Operations" description="Staff, inventory, expenses and rent reminders." />

      <div
        role="tablist"
        aria-label="Operations sections"
        className="mb-4 flex gap-1 border-b border-[var(--color-border)]"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === entry.id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'staff' && <StaffTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'reminders' && <RemindersTab />}
    </>
  );
}

function StaffTab() {
  const staff = useStaff();
  const createStaff = useCreateStaff();
  const markAttendance = useMarkStaffAttendance();

  const [form, setForm] = useState({ fullName: '', role: '', phone: '', salary: '' });
  const [error, setError] = useState<string | null>(null);

  async function add(): Promise<void> {
    setError(null);
    try {
      await createStaff.mutateAsync({
        fullName: form.fullName.trim(),
        role: form.role.trim(),
        ...(form.phone.trim() === '' ? {} : { phone: form.phone.trim() }),
        ...(form.salary === ''
          ? {}
          : { monthlySalaryPaise: Math.round(Number(form.salary) * 100) }),
        joinedOn: todayString(),
      });
      setForm({ fullName: '', role: '', phone: '', salary: '' });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not add staff.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Add staff">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" htmlFor="staff-name">
            <Input
              id="staff-name"
              value={form.fullName}
              onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            />
          </Field>
          <Field label="Role" htmlFor="staff-role">
            <Input
              id="staff-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              placeholder="Caretaker"
            />
          </Field>
          <Field label="Phone" htmlFor="staff-phone">
            <Input
              id="staff-phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          <Field label="Monthly salary (₹)" htmlFor="staff-salary">
            <Input
              id="staff-salary"
              type="number"
              min={0}
              value={form.salary}
              onChange={(event) => setForm({ ...form, salary: event.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => void add()}
            disabled={
              form.fullName.trim() === '' || form.role.trim() === '' || createStaff.isPending
            }
          >
            {createStaff.isPending ? 'Adding…' : 'Add staff'}
          </Button>
          {error !== null && (
            <span role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </span>
          )}
        </div>
      </Card>

      <Card title="Today's attendance">
        {staff.isPending ? (
          <LoadingRows />
        ) : staff.error ? (
          <ErrorState message={staff.error.message} onRetry={() => void staff.refetch()} />
        ) : staff.data.length === 0 ? (
          <EmptyState title="No staff yet" description="Add a caretaker or cook above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Phone</Th>
                <Th align="right">Salary</Th>
                <Th align="right">Present this month</Th>
                <Th>Today</Th>
              </tr>
            </thead>
            <tbody>
              {staff.data.map((member) => (
                <tr key={member.id}>
                  <Td>{member.fullName}</Td>
                  <Td>{member.role}</Td>
                  <Td>{member.phone ?? '—'}</Td>
                  <Td align="right" className="tabular">
                    {member.monthlySalaryPaise === null
                      ? '—'
                      : formatINR(member.monthlySalaryPaise, { withPaise: false })}
                  </Td>
                  <Td align="right" className="tabular">
                    {member.presentDaysThisMonth}
                  </Td>
                  <Td>
                    <Select
                      aria-label={`Attendance for ${member.fullName}`}
                      value={member.todayStatus ?? ''}
                      className="w-32"
                      disabled={markAttendance.isPending}
                      onChange={(event) => {
                        void markAttendance.mutateAsync({
                          id: member.id,
                          date: todayString(),
                          status: event.target.value,
                        });
                      }}
                    >
                      <option value="">Not marked</option>
                      <option value="PRESENT">Present</option>
                      <option value="ABSENT">Absent</option>
                      <option value="HALF_DAY">Half day</option>
                      <option value="LEAVE">Leave</option>
                    </Select>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function InventoryTab() {
  const inventory = useInventory();
  const createItem = useCreateInventoryItem();
  const deleteItem = useDeleteInventoryItem();

  const [form, setForm] = useState({ name: '', category: '', quantity: '1', cost: '' });

  async function add(): Promise<void> {
    await createItem.mutateAsync({
      name: form.name.trim(),
      category: form.category.trim(),
      quantity: Number(form.quantity),
      ...(form.cost === '' ? {} : { unitCostPaise: Math.round(Number(form.cost) * 100) }),
      purchasedOn: todayString(),
    });
    setForm({ name: '', category: '', quantity: '1', cost: '' });
  }

  const totalValue = (inventory.data ?? []).reduce(
    (sum, item) => sum + (item.unitCostPaise ?? 0) * item.quantity,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Items" value={String(inventory.data?.length ?? 0)} />
        <StatTile
          label="Total units"
          value={String((inventory.data ?? []).reduce((sum, item) => sum + item.quantity, 0))}
        />
        <StatTile label="Estimated value" value={formatINR(totalValue, { withPaise: false })} />
      </div>

      <Card title="Add item">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Item" htmlFor="inv-name">
            <Input
              id="inv-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Category" htmlFor="inv-category">
            <Input
              id="inv-category"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Linen"
            />
          </Field>
          <Field label="Quantity" htmlFor="inv-quantity">
            <Input
              id="inv-quantity"
              type="number"
              min={0}
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
            />
          </Field>
          <Field label="Unit cost (₹)" htmlFor="inv-cost">
            <Input
              id="inv-cost"
              type="number"
              min={0}
              value={form.cost}
              onChange={(event) => setForm({ ...form, cost: event.target.value })}
            />
          </Field>
        </div>
        <Button
          variant="primary"
          className="mt-3"
          onClick={() => void add()}
          disabled={form.name.trim() === '' || form.category.trim() === '' || createItem.isPending}
        >
          {createItem.isPending ? 'Adding…' : 'Add item'}
        </Button>
      </Card>

      <Card title="Inventory">
        {inventory.isPending ? (
          <LoadingRows />
        ) : (inventory.data ?? []).length === 0 ? (
          <EmptyState title="Nothing tracked yet" description="Add your first item above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Unit cost</Th>
                <Th>Purchased</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(inventory.data ?? []).map((item) => (
                <tr key={item.id}>
                  <Td>{item.name}</Td>
                  <Td>{item.category}</Td>
                  <Td align="right" className="tabular">
                    {item.quantity}
                  </Td>
                  <Td align="right" className="tabular">
                    {item.unitCostPaise === null
                      ? '—'
                      : formatINR(item.unitCostPaise, { withPaise: false })}
                  </Td>
                  <Td>{formatDate(item.purchasedOn)}</Td>
                  <Td align="right">
                    <Button variant="ghost" onClick={() => void deleteItem.mutateAsync(item.id)}>
                      Remove
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ExpensesTab() {
  const expenses = useExpenses();
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const [form, setForm] = useState({ title: '', category: '', amount: '', spentOn: todayString() });

  async function add(): Promise<void> {
    await createExpense.mutateAsync({
      title: form.title.trim(),
      category: form.category.trim(),
      amountPaise: Math.round(Number(form.amount) * 100),
      spentOn: form.spentOn,
    });
    setForm({ title: '', category: '', amount: '', spentOn: todayString() });
  }

  return (
    <div className="flex flex-col gap-4">
      <StatTile
        label="Spent this month"
        value={formatINR(expenses.data?.totalPaise ?? 0, { withPaise: false })}
      />

      <Card title="Record expense">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="What for" htmlFor="exp-title">
            <Input
              id="exp-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Plumbing repair"
            />
          </Field>
          <Field label="Category" htmlFor="exp-category">
            <Input
              id="exp-category"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Maintenance"
            />
          </Field>
          <Field label="Amount (₹)" htmlFor="exp-amount">
            <Input
              id="exp-amount"
              type="number"
              min={1}
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </Field>
          <Field label="Date" htmlFor="exp-date">
            <Input
              id="exp-date"
              type="date"
              value={form.spentOn}
              onChange={(event) => setForm({ ...form, spentOn: event.target.value })}
            />
          </Field>
        </div>
        <Button
          variant="primary"
          className="mt-3"
          onClick={() => void add()}
          disabled={form.title.trim() === '' || form.amount === '' || createExpense.isPending}
        >
          {createExpense.isPending ? 'Recording…' : 'Record expense'}
        </Button>
      </Card>

      <Card title="This month">
        {expenses.isPending ? (
          <LoadingRows />
        ) : (expenses.data?.expenses ?? []).length === 0 ? (
          <EmptyState title="No expenses recorded" description="Add one above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>What for</Th>
                <Th>Category</Th>
                <Th align="right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(expenses.data?.expenses ?? []).map((expense) => (
                <tr key={expense.id}>
                  <Td>{formatDate(expense.spentOn)}</Td>
                  <Td>{expense.title}</Td>
                  <Td>{expense.category}</Td>
                  <Td align="right" className="tabular">
                    {formatINR(expense.amountPaise, { withPaise: false })}
                  </Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      onClick={() => void deleteExpense.mutateAsync(expense.id)}
                    >
                      Remove
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function RemindersTab() {
  const reminders = useReminders();

  return (
    <Card title="Rent reminders">
      <p className="mb-3 text-sm text-[var(--color-text-secondary)]">
        Reminders are recorded here. WhatsApp and email delivery are not connected yet — the
        provider plugs in behind this log without changing anything else.
      </p>

      {reminders.isPending ? (
        <LoadingRows />
      ) : (reminders.data ?? []).length === 0 ? (
        <EmptyState title="No reminders yet" description="They are created when rent falls due." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Created</Th>
              <Th>When</Th>
              <Th>Channel</Th>
              <Th>Message</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(reminders.data ?? []).map((reminder) => (
              <tr key={reminder.id}>
                <Td>{formatDate(reminder.createdAt)}</Td>
                <Td>{reminder.kind.replace('_', ' ').toLowerCase()}</Td>
                <Td>{reminder.channel}</Td>
                <Td className="text-xs">{reminder.message}</Td>
                <Td>
                  <Badge
                    label={reminder.status}
                    tone={
                      reminder.status === 'SENT'
                        ? 'success'
                        : reminder.status === 'FAILED'
                          ? 'danger'
                          : 'neutral'
                    }
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
