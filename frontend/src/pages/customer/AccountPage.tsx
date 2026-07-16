import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { accountApi, type Address, type AddressPayload } from '../../features/account/account.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { extractApiError } from '../../lib/apiClient';

const EMPTY_ADDRESS: AddressPayload = {
  type: 'HOME',
  contactName: '',
  contactPhone: '',
  line1: '',
  line2: '',
  landmark: '',
  pincode: '',
  city: 'Hyderabad',
  state: 'Telangana',
  isDefault: false,
};

export function AccountPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddressPayload>(EMPTY_ADDRESS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: accountApi.listAddresses,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: AddressPayload) =>
      editingId ? accountApi.updateAddress(editingId, payload) : accountApi.createAddress(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setForm(EMPTY_ADDRESS);
      setEditingId(null);
      setError(null);
    },
    onError: (err) => setError(extractApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountApi.deleteAddress(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  const startEdit = (a: Address) => {
    setEditingId(a.id);
    setForm({
      type: a.type,
      label: a.label ?? '',
      contactName: a.contactName,
      contactPhone: a.contactPhone,
      line1: a.line1,
      line2: a.line2 ?? '',
      landmark: a.landmark ?? '',
      pincode: a.pincode,
      city: a.city,
      state: a.state,
      isDefault: a.isDefault,
    });
  };

  const set = (key: keyof AddressPayload) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="container-app py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Hi, {user?.name}</h1>
          <p className="text-sm text-ink-muted">{user?.email}</p>
        </div>
        <Button variant="ghost" onClick={() => logout()}>
          Sign out
        </Button>
      </div>

      {!user?.emailVerified && (
        <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-ink">
          Please verify your email to unlock all features. Check your inbox for the link.
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Saved addresses */}
        <section>
          <h2 className="mb-4 text-lg font-bold">Saved addresses</h2>
          {isLoading ? (
            <div className="skeleton h-24 w-full" />
          ) : addresses.length === 0 ? (
            <p className="text-sm text-ink-muted">No addresses saved yet.</p>
          ) : (
            <div className="space-y-3">
              {addresses.map((a) => (
                <div key={a.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {a.contactName}{' '}
                        <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs">
                          {a.type}
                        </span>
                        {a.isDefault && (
                          <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-xs text-brand">
                            Default
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}, {a.city} — {a.pincode}
                      </p>
                      <p className="text-sm text-ink-muted">{a.contactPhone}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => startEdit(a)}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(a.id)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Address form */}
        <section>
          <h2 className="mb-4 text-lg font-bold">
            {editingId ? 'Edit address' : 'Add a new address'}
          </h2>
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div className="card space-y-3 p-4">
            <TextField
              label="Contact name"
              value={form.contactName}
              onChange={set('contactName')}
            />
            <TextField
              label="Contact phone"
              value={form.contactPhone}
              onChange={set('contactPhone')}
            />
            <TextField label="Address line 1" value={form.line1} onChange={set('line1')} />
            <TextField
              label="Address line 2"
              value={form.line2 ?? ''}
              onChange={set('line2')}
            />
            <TextField
              label="Landmark"
              value={form.landmark ?? ''}
              onChange={set('landmark')}
            />
            <TextField label="Pincode" value={form.pincode} onChange={set('pincode')} />
            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate(form)}
                isLoading={saveMutation.isPending}
              >
                {editingId ? 'Update address' : 'Save address'}
              </Button>
              {editingId && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_ADDRESS);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
