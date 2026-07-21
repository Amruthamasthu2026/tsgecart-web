/**
 * Config.gs — all configuration for this Apps Script project. Nothing in
 * this file (or anywhere else in this project) hardcodes a secret, a
 * folder ID, or a spreadsheet ID — those live in Script Properties
 * (Project Settings → Script Properties in the Apps Script editor), set
 * once during deployment and never committed to source control.
 *
 * Phase 1 scope: image folders only (products/categories/banners). The
 * wider architecture reserves `invoices`/`exports` folder keys and a
 * Spreadsheet ID property for later phases — add them to FOLDER_PROPERTY_KEYS
 * / a SPREADSHEET_ID property when that work starts; nothing here needs to
 * change shape to support it.
 */

/** Script Property key → the folder-key clients send in `folder`. */
var FOLDER_PROPERTY_KEYS = {
  products: 'FOLDER_ID_PRODUCTS',
  categories: 'FOLDER_ID_CATEGORIES',
  banners: 'FOLDER_ID_BANNERS',
};

var SHARED_SECRET_PROPERTY_KEY = 'SHARED_SECRET';

/** Throws if the shared secret Script Property hasn't been set yet — a deploy-time misconfiguration, not a caller error. */
function getSharedSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty(SHARED_SECRET_PROPERTY_KEY);
  if (!secret) {
    throw new Error('SHARED_SECRET Script Property is not set. See google-apps-script/README.md.');
  }
  return secret;
}

/**
 * Resolves a folder key (e.g. "products") to its real Drive folder ID.
 * Folder IDs are NEVER hardcoded and NEVER returned to any caller —
 * they only ever exist inside this script's Script Properties and the
 * `DriveApp.getFolderById()` calls in DriveService.gs.
 */
function getFolderId_(folderKey) {
  var propertyKey = FOLDER_PROPERTY_KEYS[folderKey];
  if (!propertyKey) {
    throw new Error('Unknown folder key: ' + folderKey);
  }
  var folderId = PropertiesService.getScriptProperties().getProperty(propertyKey);
  if (!folderId) {
    throw new Error('Script Property ' + propertyKey + ' is not set. Run createDriveFolders() once, or set it manually. See google-apps-script/README.md.');
  }
  return folderId;
}

/**
 * One-time setup helper — run manually from the Apps Script editor
 * (select this function in the toolbar dropdown and click Run) after
 * creating the project. Creates a parent "TSG eCart Assets" folder plus
 * the three Phase-1 image subfolders under it, and writes their IDs
 * straight into Script Properties — no manual copy-pasting of folder IDs
 * required. Safe to re-run: it reuses folders it finds by name instead of
 * creating duplicates.
 */
function createDriveFolders() {
  var root = findOrCreateFolder_(DriveApp.getRootFolder(), 'TSG eCart Assets');
  var properties = PropertiesService.getScriptProperties();

  Object.keys(FOLDER_PROPERTY_KEYS).forEach(function (folderKey) {
    var label = folderKey.charAt(0).toUpperCase() + folderKey.slice(1);
    var folder = findOrCreateFolder_(root, label);
    properties.setProperty(FOLDER_PROPERTY_KEYS[folderKey], folder.getId());
    Logger.log(folderKey + ' -> ' + folder.getId());
  });

  Logger.log('Done. Folder IDs written to Script Properties.');
}

function findOrCreateFolder_(parent, name) {
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) {
    return existing.next();
  }
  return parent.createFolder(name);
}

/**
 * One-time setup helper for the shared secret — run manually, ONCE, from
 * the Apps Script editor. Generates a random 32-byte secret and stores it
 * in Script Properties; logs it once so the operator can copy it into
 * `firebase functions:secrets:set APPS_SCRIPT_SECRET`. Re-running this
 * rotates the secret (the old value stops working immediately) — only do
 * that deliberately.
 */
function generateSharedSecret() {
  var bytes = [];
  for (var i = 0; i < 32; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  var secret = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  PropertiesService.getScriptProperties().setProperty(SHARED_SECRET_PROPERTY_KEY, secret);
  Logger.log('Generated shared secret (copy this into APPS_SCRIPT_SECRET, then close this log): ' + secret);
}
