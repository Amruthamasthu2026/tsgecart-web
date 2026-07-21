/**
 * Utilities.gs — small, side-effect-free (except logging) helpers shared
 * by Code.gs/DriveService.gs. No business logic lives here — validation
 * decisions belong to the Cloud Function that calls this bridge; this file
 * only ever does mechanical JSON/blob/logging plumbing.
 */

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function okResponse_(fields) {
  var body = { ok: true };
  Object.keys(fields || {}).forEach(function (key) {
    body[key] = fields[key];
  });
  return jsonResponse_(body);
}

function errorResponse_(message) {
  logError_(message);
  return jsonResponse_({ ok: false, error: String(message) });
}

/**
 * Constant-time-ish string comparison for the shared secret. Apps Script
 * has no crypto.timingSafeEqual equivalent; this loops the full length of
 * BOTH strings regardless of where they first differ, which is good
 * enough to avoid a trivial early-exit timing oracle for a bridge that
 * only Cloud Functions ever calls (see driveClient.ts — never reachable
 * from a browser).
 */
function secureCompare_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Throws if `payload.secret` doesn't match the configured shared secret. Called first, before touching Drive, on every action. */
function requireValidSecret_(payload) {
  var expected = getSharedSecret_();
  var provided = payload && payload.secret;
  if (!secureCompare_(String(provided || ''), expected)) {
    throw new Error('Invalid or missing shared secret');
  }
}

function base64ToBlob_(base64Data, mimeType, fileName) {
  var bytes = Utilities.base64Decode(base64Data);
  return Utilities.newBlob(bytes, mimeType, fileName);
}

function logInfo_(message) {
  console.log(JSON.stringify({ severity: 'INFO', message: message, time: new Date().toISOString() }));
}

function logError_(message) {
  console.error(JSON.stringify({ severity: 'ERROR', message: String(message), time: new Date().toISOString() }));
}
