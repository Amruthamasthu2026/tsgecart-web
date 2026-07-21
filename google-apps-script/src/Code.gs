/**
 * Code.gs — the two entrypoints Apps Script recognizes for a deployed web
 * app. `doPost` is the real bridge (every action Cloud Functions calls
 * goes through it); `doGet` is a lightweight health check so the operator
 * (or an uptime check) can confirm the deployment is live without needing
 * to construct a real upload payload.
 *
 * Routing only — every action handler lives in DriveService.gs. Nothing
 * here (or anywhere in this project) verifies a payment, computes a
 * price, or makes any decision beyond "is the secret valid, which
 * function does this action map to."
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    requireValidSecret_(params);
    return okResponse_({ service: 'tsgecart-drive-bridge', time: new Date().toISOString() });
  } catch (err) {
    return errorResponse_(err);
  }
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return errorResponse_('Invalid JSON body');
  }

  try {
    requireValidSecret_(payload);
  } catch (err) {
    return errorResponse_(err);
  }

  try {
    switch (payload.action) {
      case 'uploadImage': {
        var uploaded = driveUploadFile_(payload);
        logInfo_('uploadImage ' + uploaded.fileId + ' (' + payload.folder + ')');
        return okResponse_(uploaded);
      }
      case 'deleteImage': {
        var deleted = driveDeleteFile_(payload.fileId);
        logInfo_('deleteImage ' + payload.fileId);
        return okResponse_(deleted);
      }
      case 'replaceImage': {
        var replaced = driveReplaceFile_(payload);
        logInfo_('replaceImage ' + replaced.oldFileId + ' -> ' + replaced.fileId);
        return okResponse_(replaced);
      }
      default:
        return errorResponse_('Unknown action: ' + payload.action);
    }
  } catch (err) {
    return errorResponse_(err);
  }
}
