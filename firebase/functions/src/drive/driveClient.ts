import { appsScriptUrlSecret, appsScriptSecretSecret } from '../config/environment';
import { AppError } from '../shared/errors';
import type {
  AppsScriptDeleteRequest,
  AppsScriptDeleteResponse,
  AppsScriptReplaceRequest,
  AppsScriptReplaceResponse,
  AppsScriptResponse,
  AppsScriptUploadRequest,
  AppsScriptUploadResponse,
} from './drive.types';

/**
 * Thin HTTP bridge to the deployed Apps Script web app — the ONLY place in
 * this codebase that ever calls it. React never does (no Apps Script URL
 * ships to the client bundle); every other Function that needs Drive/Sheets
 * access goes through this module or its `sheets/sheetsClient.ts` sibling.
 *
 * Apps Script web apps have no custom-header auth story worth relying on,
 * so the shared secret travels inside the JSON body — `Config.gs`'s
 * `requireValidSecret_` rejects any request whose `secret` field doesn't
 * match the Script Property before touching Drive/Sheets at all. Both
 * `APPS_SCRIPT_URL` and `APPS_SCRIPT_SECRET` are Secret Manager params
 * (`config/environment.ts`) — resolved via `.value()` only inside a
 * Function that declares them in `secrets: [...]`, never logged, never
 * echoed back to the caller.
 */

const REQUEST_TIMEOUT_MS = 20_000;

async function callAppsScript<TReq extends { action: string }, TRes>(body: TReq): Promise<TRes> {
  const url = appsScriptUrlSecret.value();
  const secret = appsScriptSecretSecret.value();
  if (!url || !secret) {
    throw new AppError('Drive/Sheets bridge is not configured (APPS_SCRIPT_URL/APPS_SCRIPT_SECRET missing)', 503, 'BRIDGE_NOT_CONFIGURED', 'unavailable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, secret }),
      signal: controller.signal,
      // Apps Script /exec URLs 302-redirect to googleusercontent.com for the
      // actual response — fetch follows redirects by default, which is what
      // we want here (the default 'follow' is explicit for clarity).
      redirect: 'follow',
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new AppError('Drive/Sheets bridge timed out', 504, 'BRIDGE_TIMEOUT', 'deadline-exceeded');
    }
    throw new AppError('Could not reach the Drive/Sheets bridge', 502, 'BRIDGE_UNREACHABLE', 'unavailable', { cause: String(err) });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AppError(`Drive/Sheets bridge returned HTTP ${response.status}`, 502, 'BRIDGE_HTTP_ERROR', 'unavailable');
  }

  let parsed: AppsScriptResponse;
  try {
    parsed = (await response.json()) as AppsScriptResponse;
  } catch {
    throw new AppError('Drive/Sheets bridge returned a non-JSON response', 502, 'BRIDGE_BAD_RESPONSE', 'unavailable');
  }

  if (!parsed.ok) {
    throw new AppError(parsed.error || 'Drive/Sheets bridge reported an error', 502, 'BRIDGE_ERROR', 'unavailable');
  }
  return parsed as unknown as TRes;
}

export async function uploadImageViaAppsScript(req: Omit<AppsScriptUploadRequest, 'action'>): Promise<AppsScriptUploadResponse> {
  return callAppsScript<AppsScriptUploadRequest, AppsScriptUploadResponse>({ action: 'uploadImage', ...req });
}

export async function deleteImageViaAppsScript(req: Omit<AppsScriptDeleteRequest, 'action'>): Promise<AppsScriptDeleteResponse> {
  return callAppsScript<AppsScriptDeleteRequest, AppsScriptDeleteResponse>({ action: 'deleteImage', ...req });
}

export async function replaceImageViaAppsScript(req: Omit<AppsScriptReplaceRequest, 'action'>): Promise<AppsScriptReplaceResponse> {
  return callAppsScript<AppsScriptReplaceRequest, AppsScriptReplaceResponse>({ action: 'replaceImage', ...req });
}
