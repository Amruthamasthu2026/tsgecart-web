/**
 * DriveService.gs — the ONLY file in this project that touches DriveApp.
 * Pure I/O: create a file, trash a file. No decision about whether an
 * upload SHOULD happen lives here — that's made in Cloud Functions
 * (firebase/functions/src/drive/drive.function.ts) before this script is
 * ever called. The re-validation below is defense in depth (this web app
 * is reachable by anyone who has the URL + secret, not exclusively by the
 * Cloud Function), never the authoritative check.
 */

var ALLOWED_MIME_TYPES_ = ['image/jpeg', 'image/png', 'image/webp'];
var MAX_UPLOAD_BYTES_ = 5 * 1024 * 1024; // 5 MB — mirrors drive.types.ts MAX_IMAGE_UPLOAD_BYTES

function assertUploadPayloadValid_(payload) {
  if (!payload.folder || !FOLDER_PROPERTY_KEYS[payload.folder]) {
    throw new Error('Unknown or missing folder: ' + payload.folder);
  }
  if (!payload.fileName) {
    throw new Error('Missing fileName');
  }
  if (ALLOWED_MIME_TYPES_.indexOf(payload.mimeType) === -1) {
    throw new Error('Unsupported mimeType: ' + payload.mimeType);
  }
  if (!payload.base64Data) {
    throw new Error('Missing base64Data');
  }
  // Base64 is ~4/3 the size of the decoded bytes; this is a cheap
  // upper-bound pre-check before actually decoding the (potentially
  // large) string into memory.
  if (payload.base64Data.length > Math.ceil((MAX_UPLOAD_BYTES_ * 4) / 3) + 8) {
    throw new Error('Image exceeds the 5 MB limit');
  }
}

/**
 * Creates the file in the target folder, makes it link-viewable (so the
 * returned URL works for a public storefront `<img>` tag without a Google
 * sign-in), and returns the metadata shape `AppsScriptUploadResponse`
 * expects.
 */
function driveUploadFile_(payload) {
  assertUploadPayloadValid_(payload);

  var folder = DriveApp.getFolderById(getFolderId_(payload.folder));
  var blob = base64ToBlob_(payload.base64Data, payload.mimeType, payload.fileName);

  if (blob.getBytes().length > MAX_UPLOAD_BYTES_) {
    throw new Error('Image exceeds the 5 MB limit');
  }

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = file.getId();
  return {
    fileId: fileId,
    imageUrl: driveFileViewUrl_(fileId),
    fileName: file.getName(),
    mimeType: payload.mimeType,
    size: blob.getBytes().length,
    uploadedAt: new Date().toISOString(),
  };
}

/** Direct-view URL — renders as an `<img>` source without a Drive UI wrapper, unlike the default "open" link. */
function driveFileViewUrl_(fileId) {
  return 'https://lh3.googleusercontent.com/d/' + fileId;
}

/** Trashes (not permanently deletes — recoverable for Drive's normal retention window) the file. Idempotent: trashing an already-trashed or already-gone file id does not throw. */
function driveDeleteFile_(fileId) {
  if (!fileId) {
    throw new Error('Missing fileId');
  }
  try {
    var file = DriveApp.getFileById(fileId);
    if (!file.isTrashed()) {
      file.setTrashed(true);
    }
    return { fileId: fileId, deleted: true };
  } catch (err) {
    // Not found / no access — from the caller's point of view the file is
    // already gone, which is the desired end state of a delete request.
    logError_('driveDeleteFile_: could not trash ' + fileId + ': ' + err);
    return { fileId: fileId, deleted: false };
  }
}

/**
 * Uploads the new file first, then best-effort trashes `oldFileId` — if
 * the old file is already gone or inaccessible, the replace still counts
 * as a success (the caller ends up with a new file either way); only a
 * failure to create the NEW file aborts the whole operation.
 */
function driveReplaceFile_(payload) {
  var uploaded = driveUploadFile_({
    folder: payload.folder,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    base64Data: payload.base64Data,
  });
  // The new file is already safely created at this point — a problem
  // deleting the old one (missing id, already gone, no access) must never
  // turn into a thrown error that hides the successful upload above.
  var deleteResult = payload.oldFileId ? driveDeleteFile_(payload.oldFileId) : { fileId: payload.oldFileId, deleted: false };

  return {
    fileId: uploaded.fileId,
    imageUrl: uploaded.imageUrl,
    fileName: uploaded.fileName,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
    uploadedAt: uploaded.uploadedAt,
    oldFileId: payload.oldFileId,
    oldFileDeleted: deleteResult.deleted,
  };
}
