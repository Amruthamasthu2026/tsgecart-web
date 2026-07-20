import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type BulkImportResult } from '../../features/admin/admin.api';
import { firebaseAdminApi, useFirestoreAdmin } from '../../services/firebaseAdmin';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { extractApiError } from '../../lib/apiClient';
import { extractFirebaseError } from '../../features/firebaseAuth/firebaseAuth.schemas';
import { parseAndValidate, parseCsv, type CsvRow } from '../../lib/pincodes';

const api = useFirestoreAdmin ? firebaseAdminApi : adminApi;
const extractError = useFirestoreAdmin ? extractFirebaseError : extractApiError;

type Zone = { id: string; name: string };
type Pincode = { id: string; code: string; isServiceable: boolean; zone?: { id: string; name: string } | null };

export function AdminDelivery() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Existing forms
  const [zoneForm, setZoneForm] = useState({ name: '', deliveryCharge: '', freeDeliveryLimit: '', minEtaMinutes: '20', maxEtaMinutes: '45' });
  const [pincodeForm, setPincodeForm] = useState({ code: '', zoneId: '' });

  // Bulk state
  const [bulkZoneId, setBulkZoneId] = useState('');
  const [mode, setMode] = useState<'skip' | 'upsert'>('skip');
  const [paste, setPaste] = useState('');
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveZoneId, setMoveZoneId] = useState('');

  const { data: zones = [] } = useQuery<Zone[]>({ queryKey: ['admin-zones'], queryFn: api.listZones });
  const { data: pincodes = [] } = useQuery<Pincode[]>({ queryKey: ['admin-pincodes'], queryFn: api.listPincodes });

  const refreshPincodes = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-pincodes'] });
    setSelected(new Set());
  };

  const parsed = useMemo(() => parseAndValidate(paste), [paste]);

  // ── Mutations ──────────────────────────────────────────────
  const createZone = useMutation({
    mutationFn: () =>
      api.createZone({
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
    onError: (e) => setError(extractError(e)),
  });

  const createPincode = useMutation({
    mutationFn: () => api.createPincode({ code: pincodeForm.code, zoneId: pincodeForm.zoneId || undefined }),
    onSuccess: () => {
      setPincodeForm({ code: '', zoneId: '' });
      refreshPincodes();
    },
    onError: (e) => setError(extractError(e)),
  });

  const importMutation = useMutation({
    mutationFn: (items: { code: string; zoneName?: string }[]) =>
      api.bulkImportPincodes(items, bulkZoneId || undefined, mode),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      refreshPincodes();
    },
    onError: (e) => setError(extractError(e)),
  });

  // Not ported to Firestore (see services/firebaseAdmin.ts header — no
  // live Express frontend consumer of "Import Hyderabad" either); the
  // button below is disabled with a note when useFirestoreAdmin is on.
  const hyderabadMutation = useMutation({
    mutationFn: () =>
      useFirestoreAdmin
        ? Promise.reject(new Error('Import Hyderabad pincodes is not available in Firebase mode.'))
        : adminApi.importHyderabad(bulkZoneId || undefined),
    onSuccess: (r) => {
      setResult(r as BulkImportResult);
      setError(null);
      refreshPincodes();
    },
    onError: (e) => setError(extractError(e)),
  });

  const bulkAction = useMutation({
    mutationFn: (vars: { action: 'activate' | 'deactivate' | 'move' | 'delete'; zoneId?: string }) =>
      api.bulkActionPincodes([...selected], vars.action, vars.zoneId),
    onSuccess: refreshPincodes,
    onError: (e) => setError(extractError(e)),
  });

  const onCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvRows(parseCsv(text));
    setResult(null);
  };

  const importPaste = () => {
    if (!bulkZoneId) {
      setError('Select a delivery zone to assign these pincodes to');
      return;
    }
    importMutation.mutate(parsed.valid.map((code) => ({ code })));
  };

  const importCsv = () => {
    if (!csvRows) return;
    // CSV rows may carry their own zoneName; those without fall back to bulkZoneId.
    const needsDefault = csvRows.some((r) => !r.zoneName);
    if (needsDefault && !bulkZoneId) {
      setError('Some CSV rows have no zone — select a default zone');
      return;
    }
    importMutation.mutate(csvRows.map((r) => ({ code: r.code, zoneName: r.zoneName })));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = pincodes.length > 0 && selected.size === pincodes.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pincodes.map((p) => p.id)));

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-ink">Delivery Management</h1>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Zones */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-ink">Zones</h2>
          <div className="grid gap-2">
            <TextField label="Zone name" value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Delivery ₹" type="number" value={zoneForm.deliveryCharge} onChange={(e) => setZoneForm((f) => ({ ...f, deliveryCharge: e.target.value }))} />
              <TextField label="Free above ₹" type="number" value={zoneForm.freeDeliveryLimit} onChange={(e) => setZoneForm((f) => ({ ...f, freeDeliveryLimit: e.target.value }))} />
              <TextField label="Min ETA (min)" type="number" value={zoneForm.minEtaMinutes} onChange={(e) => setZoneForm((f) => ({ ...f, minEtaMinutes: e.target.value }))} />
              <TextField label="Max ETA (min)" type="number" value={zoneForm.maxEtaMinutes} onChange={(e) => setZoneForm((f) => ({ ...f, maxEtaMinutes: e.target.value }))} />
            </div>
            <Button isLoading={createZone.isPending} disabled={!zoneForm.name} onClick={() => createZone.mutate()}>Add zone</Button>
          </div>
          <div className="mt-3 space-y-2">
            {zones.map((z) => (
              <div key={z.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-ink">{z.name}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Single pincode (existing) */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-bold text-ink">Add a single pincode</h2>
          <div className="grid gap-2">
            <TextField label="Pincode" value={pincodeForm.code} onChange={(e) => setPincodeForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Zone</label>
              <select value={pincodeForm.zoneId} onChange={(e) => setPincodeForm((f) => ({ ...f, zoneId: e.target.value }))} className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm">
                <option value="">Select zone</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <Button isLoading={createPincode.isPending} disabled={pincodeForm.code.length !== 6 || !pincodeForm.zoneId} onClick={() => createPincode.mutate()}>Add pincode</Button>
          </div>
        </section>
      </div>

      {/* Bulk import */}
      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Bulk import pincodes</h2>
          <div className="text-right">
            <Button
              variant="dark"
              disabled={useFirestoreAdmin}
              isLoading={hyderabadMutation.isPending}
              onClick={() => hyderabadMutation.mutate()}
            >
              Import Hyderabad pincodes
            </Button>
            {useFirestoreAdmin && <p className="mt-1 text-xs text-ink-muted">Not available in Firebase mode — use CSV/paste import instead.</p>}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Controls */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Assign all to zone</label>
              <select value={bulkZoneId} onChange={(e) => setBulkZoneId(e.target.value)} className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm">
                <option value="">Select default zone</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">On existing:</span>
              <label className="flex items-center gap-1">
                <input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} /> Skip
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={mode === 'upsert'} onChange={() => setMode('upsert')} /> Update zone
              </label>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Upload CSV (pincode, zoneName)</label>
              <input type="file" accept=".csv,text/csv" onChange={onCsv} className="text-sm" />
              {csvRows && (
                <div className="mt-2 max-h-32 overflow-auto rounded-xl border border-black/10 text-xs">
                  <table className="w-full">
                    <thead className="bg-slate-50 text-left text-ink-muted">
                      <tr><th className="p-2">Pincode</th><th className="p-2">Zone</th></tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-t border-black/5">
                          <td className="p-2">{r.code}</td>
                          <td className="p-2">{r.zoneName ?? '(default)'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 50 && <p className="p-2 text-ink-muted">+{csvRows.length - 50} more…</p>}
                </div>
              )}
              {csvRows && (
                <Button className="mt-2" isLoading={importMutation.isPending} onClick={importCsv}>
                  Import {csvRows.length} from CSV
                </Button>
              )}
            </div>
          </div>

          {/* Paste */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Paste pincodes (commas, spaces or new lines)</label>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={7}
              placeholder={'500001\n500002, 500003\n500039'}
              className="w-full rounded-xl border border-black/10 px-4 py-2.5 font-mono text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
            />
            {paste.trim() && (
              <p className="mt-1 text-xs text-ink-muted">
                <span className="font-semibold text-badge-organic">{parsed.valid.length} valid</span>
                {parsed.invalid.length > 0 && <span className="ml-2 text-red-600">{parsed.invalid.length} invalid</span>}
                {parsed.duplicates > 0 && <span className="ml-2 text-amber-600">{parsed.duplicates} duplicate</span>}
              </p>
            )}
            <Button className="mt-2" isLoading={importMutation.isPending} disabled={parsed.valid.length === 0} onClick={importPaste}>
              Import {parsed.valid.length || ''} pincodes
            </Button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-sm">
            <p className="font-bold text-ink">Import complete</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <span className="text-badge-organic">✓ {result.stats.added} added</span>
              {result.stats.updated > 0 && <span>↻ {result.stats.updated} updated</span>}
              <span className="text-ink-muted">↷ {result.stats.skipped} skipped (existing)</span>
              {result.stats.duplicates > 0 && <span className="text-amber-600">{result.stats.duplicates} duplicate</span>}
              {result.stats.invalid > 0 && <span className="text-red-600">✗ {result.stats.invalid} invalid</span>}
              {result.stats.failed > 0 && <span className="text-red-600">! {result.stats.failed} failed</span>}
            </div>
            {result.warnings.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">{result.warnings.length} assigned to an inactive zone (not serviceable until activated).</p>
            )}
          </div>
        )}
      </section>

      {/* Pincodes list with selection + bulk actions */}
      <section className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Serviceable pincodes ({pincodes.length})</h2>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <button onClick={() => bulkAction.mutate({ action: 'activate' })} className="rounded-full bg-badge-organic/10 px-3 py-1.5 text-xs font-semibold text-badge-organic">Activate</button>
              <button onClick={() => bulkAction.mutate({ action: 'deactivate' })} className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700">Deactivate</button>
              <select
                value={moveZoneId}
                onChange={(e) => {
                  setMoveZoneId(e.target.value);
                  if (e.target.value) bulkAction.mutate({ action: 'move', zoneId: e.target.value });
                }}
                className="rounded-full border border-black/10 px-3 py-1.5 text-xs"
              >
                <option value="">Move to zone…</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <button onClick={() => bulkAction.mutate({ action: 'delete' })} className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">Delete</button>
            </div>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-black/5 text-left text-ink-muted">
              <tr>
                <th className="p-2"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
                <th className="p-2">Pincode</th>
                <th className="p-2">Zone</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {pincodes.map((p) => (
                <tr key={p.id} className="border-b border-black/5">
                  <td className="p-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.code}`} /></td>
                  <td className="p-2 font-semibold text-ink">{p.code}</td>
                  <td className="p-2 text-ink-muted">{p.zone?.name ?? '—'}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.isServiceable ? 'bg-badge-organic/10 text-badge-organic' : 'bg-red-50 text-red-600'}`}>
                      {p.isServiceable ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pincodes.length === 0 && <p className="p-6 text-center text-ink-muted">No pincodes yet. Use bulk import to add many at once.</p>}
        </div>
      </section>
    </div>
  );
}
