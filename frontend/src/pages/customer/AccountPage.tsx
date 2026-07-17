import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { accountApi, type Address, type AddressPayload } from '../../features/account/account.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Seo } from '../../components/Seo';
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

const QUICK_LINKS = [
  { to: '/orders', label: 'My Orders', emoji: '📦' },
  { to: '/wishlist', label: 'Wishlist', emoji: '💛' },
  { to: '/rewards', label: 'Rewards', emoji: '🎁' },
  { to: '/coupons', label: 'Coupons', emoji: '🎟️' },
  { to: '/notifications', label: 'Notifications', emoji: '🔔' },
];

export function AccountPage() {
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AddressPayload>(EMPTY_ADDRESS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Profile edit
  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });
  const [profileSaved, setProfileSaved] = useState(false);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: accountApi.listAddresses,
  });

  const profileMutation = useMutation({
    mutationFn: () => accountApi.updateProfile({ name: profile.name, phone: profile.phone || undefined }),
    onSuccess: async () => {
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
      await refreshUser();
    },
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
      <Seo title="My Account" noindex />

      {/* Profile header */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-brand text-2xl font-black text-ink">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-ink">{user?.name}</h1>
            <p className="text-sm text-ink-muted">{user?.email}</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => logout()}>
          Sign out
        </Button>
      </div>

      {/* Quick links */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="card card-hover flex items-center gap-3 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-100 text-xl">{l.emoji}</span>
            <span className="text-sm font-semibold text-ink">{l.label}</span>
          </Link>
        ))}
      </div>

      {!user?.emailVerified && (
        <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-ink">
          Please verify your email to unlock all features. Check your inbox for the link.
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Profile details */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-ink">Profile details</h2>
          <div className="card space-y-3 p-5">
            <TextField
              label="Full name"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            />
            <TextField
              label="Mobile number"
              value={profile.phone}
              hint="Used for delivery updates"
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            />
            <TextField label="Email" value={user?.email ?? ''} disabled />
            <div className="flex items-center gap-3">
              <Button isLoading={profileMutation.isPending} onClick={() => profileMutation.mutate()}>
                Save changes
              </Button>
              {profileSaved && <span className="text-sm font-medium text-badge-organic">Saved ✓</span>}
            </div>
          </div>
        </section>

        {/* Address form */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-ink">
            {editingId ? 'Edit address' : 'Add a new address'}
          </h2>
          {error && (
            <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div className="card space-y-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Contact name" value={form.contactName} onChange={set('contactName')} />
              <TextField label="Contact phone" value={form.contactPhone} onChange={set('contactPhone')} />
            </div>
            <TextField label="Address line 1" value={form.line1} onChange={set('line1')} />
            <TextField label="Address line 2" value={form.line2 ?? ''} onChange={set('line2')} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Landmark" value={form.landmark ?? ''} onChange={set('landmark')} />
              <TextField label="Pincode" value={form.pincode} onChange={set('pincode')} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate(form)} isLoading={saveMutation.isPending}>
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

      {/* Saved addresses */}
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-bold text-ink">Saved addresses</h2>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-28 w-full" />
          </div>
        ) : addresses.length === 0 ? (
          <p className="text-sm text-ink-muted">No addresses saved yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{a.contactName}</span>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold">{a.type}</span>
                  {a.isDefault && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-brand">Default</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ''}, {a.city} — {a.pincode}
                </p>
                <p className="text-sm text-ink-muted">{a.contactPhone}</p>
                <div className="mt-3 flex gap-3">
                  <button onClick={() => startEdit(a)} className="text-sm font-semibold text-brand-700 hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(a.id)}
                    className="text-sm font-semibold text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
