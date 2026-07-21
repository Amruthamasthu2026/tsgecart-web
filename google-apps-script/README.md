# TSG eCart — Google Drive image bridge (Apps Script)

Phase 1 of the Firestore → Google Drive → Google Apps Script architecture.
This project has exactly one job: given an already-validated image (from
`firebase/functions/src/drive/drive.function.ts`), create/delete/replace a
file in the correct Google Drive folder and report back its metadata. It
holds **no business logic** — MIME/size validation, filenames, and
permission checks all happen in Cloud Functions before this script is ever
called.

## Files

| File | Purpose |
|---|---|
| `appsscript.json` | Project manifest — deploy as an anonymous-access web app |
| `Config.gs` | Script Properties (secret, folder IDs) + one-time setup helpers |
| `Utilities.gs` | JSON response builders, shared-secret check, base64→Blob |
| `DriveService.gs` | The only file that calls `DriveApp` — upload/delete/replace |
| `Code.gs` | `doGet`/`doPost` entrypoints — routing only |

## One-time setup

### 1. Create the Apps Script project

Either:

- **Web editor**: go to [script.google.com](https://script.google.com), create a new project, and paste in the contents of each `.gs` file above (create matching file names) plus replace the manifest via *Project Settings → Show "appsscript.json"*.
- **clasp** (recommended if you have Node/clasp installed):
  ```bash
  npm install -g @google/clasp
  clasp login
  cd google-apps-script
  clasp create --type webapp --title "TSG eCart Drive Bridge" --rootDir src
  # copy appsscript.json into src/ first, or `clasp pull` then merge
  clasp push
  ```

### 2. Generate the shared secret

In the Apps Script editor, select the `generateSharedSecret` function from
the function dropdown and click **Run**. Grant the requested permissions.
Open **View → Logs** (or **Executions**) and copy the printed secret —
you'll need it in step 5. Re-running this rotates the secret; only do that
deliberately (it will immediately invalidate the old `APPS_SCRIPT_SECRET`
your Cloud Functions have).

### 3. Create the Drive folders

Select `createDriveFolders` from the function dropdown and click **Run**.
This creates a **TSG eCart Assets** folder in the deploying account's My
Drive, with **Products**, **Categories**, and **Banners** subfolders, and
writes their IDs into Script Properties automatically — you never need to
copy a folder ID by hand. Safe to re-run (reuses folders it finds by name).

You can confirm both properties were set via **Project Settings → Script
Properties** in the editor: you should see `SHARED_SECRET`,
`FOLDER_ID_PRODUCTS`, `FOLDER_ID_CATEGORIES`, `FOLDER_ID_BANNERS`.

### 4. Deploy as a web app

**Deploy → New deployment** → type **Web app** →
- Execute as: **Me** (your account — the account whose Drive owns the folders from step 3)
- Who has access: **Anyone**

Click **Deploy**, authorize the requested scopes, and copy the **Web app
URL** (ends in `/exec`). This is your `APPS_SCRIPT_URL`.

> When you need to push a code change later, use **Deploy → Manage
> deployments → Edit (pencil) → New version** on the *same* deployment so
> the `/exec` URL stays stable — creating a brand-new deployment mints a
> new URL and would require updating `APPS_SCRIPT_URL` again.

### 5. Wire the secret + URL into Firebase

Production (Secret Manager):
```bash
cd firebase/functions
node_modules/.bin/firebase functions:secrets:set APPS_SCRIPT_URL
# paste the /exec URL from step 4 when prompted
node_modules/.bin/firebase functions:secrets:set APPS_SCRIPT_SECRET
# paste the secret from step 2 when prompted
```

Local emulator (never committed — `*.local` is gitignored):
```bash
cat >> firebase/functions/.secret.local <<'EOF'
APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXXXXXX/exec
APPS_SCRIPT_SECRET=the-secret-from-step-2
EOF
```

### 6. Verify the deployment

```bash
curl "https://script.google.com/macros/s/XXXXXXXX/exec?secret=the-secret-from-step-2"
# {"ok":true,"service":"tsgecart-drive-bridge","time":"...">
```

A `401`-shaped `{"ok":false,"error":"Invalid or missing shared secret"}`
means the secret in the URL doesn't match Script Properties — re-check step
2/5. Any other error usually means the deployment's "Execute as" account
doesn't have access to the folders from step 3.

## What Cloud Functions send

Every `doPost` body is `{ secret, action, ...fields }` — see
`firebase/functions/src/drive/drive.types.ts` for the exact shape of each
action (`uploadImage`, `deleteImage`, `replaceImage`) and its response.
Nothing here needs to change if that contract changes shape in a purely
additive way (new optional fields); a breaking change to required fields
needs this project redeployed together with the Cloud Functions change.

## Explicitly out of scope for this deployment

This project does **not** read or write Google Sheets, does not run any
scheduled trigger, and does not know anything about orders, payments,
coupons, or inventory — those are separate, later phases of the wider
architecture and are not part of what's deployed here.
