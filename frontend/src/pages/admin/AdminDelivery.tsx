import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../features/admin/admin.api';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { formatCurrency } from '../../lib/format';
import { extractApiError } from '../../lib/apiClient';

export function AdminDelivery() {
  const queryClient = useQueryClient();
  const [zoneForm, setZoneForm] = useState({ name: '', deliveryCharge: '', freeDeliveryLimit: '', minEtaMinutes: '20', maxEtaMinutes: '45' });
  const [pincodeForm, setPincodeForm] = useState({ code: '', zoneId: '' });
  const [error, setError] = useState<string | null>(null);

  const { data: zones = [] } = useQuery({ queryKey: ['admin-zones'], queryFn: adminApi.listZones });
  const { data: pincodes = [] } = useQuery({ queryKey: ['admin-pincodes'], queryFn: adminApi.listPincodes });

  const createZone = useMutation({
    mutationFn: () =>
      adminApi.createZone({
        name: zoneForm.name,
        deliveryCharge: Number(zoneForm.deliveryCharge) || 0,
        freeDeliveryLimit: Number(zoneForm.freeDeliveryLimit) || 0,
        minEtaMinutes: Number(zoneForm.minEtaMinutes) || 20,
        maxEtaMinutes: Number(zoneForm.maxEtaMinutes) || 45,
      }),
    onSuccess: () => {
      setZoneForm({ name: '', deliveryCharge: '', freeDeliveryLimit: '', minEtaMinutes: '20', maxEtaMinutes: '45' });
      queryClient.invalidateQueries({ queryKey: ['admin-zones'] });
    },
    onError: (err) => setError(extractApiError(err)),
  });

  const createPincode = useMutation({
    mutationFn: () =>
      adminApi.createPincode({ code: pincodeForm.code, zoneId: pincodeForm.zoneId || undefined }),
    onSuccess: () => {
      setPincodeForm({ code: '', zoneId: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-pincodes'] });
    },
    onError: (err) => setError(extractApiError(err)),
  });

  const deletePincode = useMutation({
    mutationFn: (id: string) => adminApi.deletePincode(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-pincodes'] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Delivery</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* Zones */}
        <section>
          <h2 className="mb-3 text-lg font-bold">Zones</h2>
          <div className="grid gap-2 rounded-2xl bg-white p-4 shadow-card">
            <TextField label="Zone name" value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Delivery ₹" type="number" value={zoneForm.deliveryCharge} onChange={(e) => setZoneForm((f) => ({ ...f, deliveryCharge: e.target.value }))} />
              <TextField label="Free above ₹" type="number" value={zoneForm.freeDeliveryLimit} onChange={(e) => setZoneForm((f) => ({ ...f, freeDeliveryLimit: e.target.value }))} />
              <TextField label="Min ETA (min)" type="number" value={zoneForm.minEtaMinutes} onChange={(e) => setZoneForm((f) => ({ ...f, minEtaMinutes: e.target.value }))} />
              <TextField label="Max ETA (min)" type="number" value={zoneForm.maxEtaMinutes} onChange={(e) => setZoneForm((f) => ({ ...f, maxEtaMinutes: e.target.value }))} />
            </div>
            <Button isLoading={createZone.isPending} disabled={!zoneForm.name} onClick={() => createZone.mutate()}>
              Add zone
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {zones.map((z: Record<string, unknown> & { id: string }) => (
              <div key={z.id} className="rounded-xl bg-white p-3 text-sm shadow-card">
                <p className="font-semibold">{String(z.name)}</p>
                <p className="text-ink-muted">
                  Delivery {formatCurrency(z.deliveryCharge as string)} · Free above{' '}
                  {formatCurrency(z.freeDeliveryLimit as string)} · ETA {String(z.minEtaMinutes)}–
                  {String(z.maxEtaMinutes)} min
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Pincodes */}
        <section>
          <h2 className="mb-3 text-lg font-bold">Serviceable pincodes</h2>
          <div className="grid gap-2 rounded-2xl bg-white p-4 shadow-card">
            <TextField label="Pincode" value={pincodeForm.code} onChange={(e) => setPincodeForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Zone</label>
              <select
                value={pincodeForm.zoneId}
                onChange={(e) => setPincodeForm((f) => ({ ...f, zoneId: e.target.value }))}
                className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm"
              >
                <option value="">Select zone</option>
                {zones.map((z: Record<string, unknown> & { id: string }) => (
                  <option key={z.id} value={z.id}>
                    {String(z.name)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              isLoading={createPincode.isPending}
              disabled={pincodeForm.code.length !== 6 || !pincodeForm.zoneId}
              onClick={() => createPincode.mutate()}
            >
              Add pincode
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pincodes.map((p: Record<string, unknown> & { id: string }) => (
              <span key={p.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm shadow-card">
                {String(p.code)}
                <button onClick={() => deletePincode.mutate(p.id)} className="text-red-600">
                  ✕
                </button>
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
