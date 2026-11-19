const ARCHIVE_CONFIG = Object.freeze({
  rootFolderName: 'RFG Log Archives',
  storageProvider: 'google-drive',
  pageSize: 1000,
  defaultMaxMonthsPerRun: 3,
  maximumMonthsPerRun: 12,
  triggerFunction: 'archiveOldLogs',
  triggerDay: 2,
  triggerHour: 2,
  triggerMinute: 15,
  timeZone: 'Asia/Kolkata'
});

function setupGoogleDriveArchive() {
  const properties = PropertiesService.getScriptProperties();
  requireProperty_(properties, 'SUPABASE_URL');
  requireLegacyServiceRoleKey_(properties);

  let folderId = properties.getProperty('DRIVE_FOLDER_ID');
  let folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    folder = DriveApp.createFolder(ARCHIVE_CONFIG.rootFolderName);
    folderId = folder.getId();
    properties.setProperty('DRIVE_FOLDER_ID', folderId);
  }
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);

  const result = verifyGoogleDriveArchiveSetup();
  result.triggerId = installMonthlyArchiveTrigger();
  console.log(JSON.stringify(result));
  return result;
}

function installMonthlyArchiveTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === ARCHIVE_CONFIG.triggerFunction;
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  const trigger = ScriptApp.newTrigger(ARCHIVE_CONFIG.triggerFunction)
    .timeBased()
    .onMonthDay(ARCHIVE_CONFIG.triggerDay)
    .atHour(ARCHIVE_CONFIG.triggerHour)
    .nearMinute(ARCHIVE_CONFIG.triggerMinute)
    .inTimezone(ARCHIVE_CONFIG.timeZone)
    .create();

  console.log('Monthly archive trigger installed: ' + trigger.getUniqueId());
  return trigger.getUniqueId();
}

function verifyGoogleDriveArchiveSetup() {
  const properties = PropertiesService.getScriptProperties();
  const supabaseUrl = normalizeSupabaseUrl_(requireProperty_(properties, 'SUPABASE_URL'));
  requireLegacyServiceRoleKey_(properties);
  const folderId = requireProperty_(properties, 'DRIVE_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);

  const rows = supabaseRequest_(
    'GET',
    '/rest/v1/log_archives?select=id,storage_provider&limit=1',
    null,
    properties
  );

  return {
    ok: true,
    supabaseUrl: supabaseUrl,
    folderName: folder.getName(),
    folderId: folder.getId(),
    databaseReady: Array.isArray(rows),
    schedule: 'Monthly on day 2 around 02:15 Asia/Kolkata'
  };
}

function archiveOldLogs() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another archive run is already active.');
    return { ok: true, message: 'Another archive run is already active.', archives: [] };
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    requireProperty_(properties, 'SUPABASE_URL');
    requireLegacyServiceRoleKey_(properties);
    const rootFolder = DriveApp.getFolderById(requireProperty_(properties, 'DRIVE_FOLDER_ID'));
    const maxMonths = getMaxMonthsPerRun_(properties);
    const cutoffDate = addUtcMonths_(utcMonthStart_(new Date()), -1);
    const cutoffIso = cutoffDate.toISOString();
    const results = [];

    for (let batch = 0; batch < maxMonths; batch += 1) {
      const candidates = [
        oldestTimestamp_('activity_logs', cutoffIso, properties),
        oldestTimestamp_('login_logs', cutoffIso, properties)
      ].filter(Boolean).sort();

      if (candidates.length === 0) break;

      const targetMonth = utcMonthStart_(new Date(candidates[0]));
      const nextMonth = addUtcMonths_(targetMonth, 1);
      const startIso = targetMonth.toISOString();
      const endIso = nextMonth.toISOString();
      const activityLogs = fetchAllRows_(
        'activity_logs',
        'id,application_id,actor_id,action,details,created_at',
        startIso,
        endIso,
        properties
      );
      const loginLogs = fetchAllRows_(
        'login_logs',
        'id,user_id,email,role,success,ip_address,user_agent,created_at',
        startIso,
        endIso,
        properties
      );

      const month = formatUtcMonth_(targetMonth);
      const payload = JSON.stringify({
        format: 'rfg-log-archive-v1',
        archive_month: month,
        archive_boundary: nextMonth.toISOString(),
        retention_policy: 'current-and-previous-calendar-month',
        activity_logs: activityLogs,
        login_logs: loginLogs
      });

      const stored = storeVerifiedArchive_(rootFolder, targetMonth, payload);
      const finalized = supabaseRequest_(
        'POST',
        '/rest/v1/rpc/finalize_log_archive',
        {
          p_archive_month: formatUtcDate_(targetMonth),
          p_object_key: stored.objectKey,
          p_bucket_name: ARCHIVE_CONFIG.storageProvider,
          p_checksum_sha256: stored.checksum,
          p_size_bytes: stored.sizeBytes,
          p_activity_ids: activityLogs.map(function (row) { return row.id; }),
          p_login_ids: loginLogs.map(function (row) { return row.id; })
        },
        properties
      );

      const result = {
        archiveMonth: month,
        activityCount: activityLogs.length,
        loginCount: loginLogs.length,
        sizeBytes: stored.sizeBytes,
        reusedFile: stored.reusedFile,
        fileId: stored.fileId,
        finalized: finalized
      };
      results.push(result);
      console.log('Archived ' + month + ': ' + JSON.stringify(result));
    }

    const response = {
      ok: true,
      message: results.length
        ? 'Eligible log months were archived to Google Drive.'
        : 'No logs are old enough to archive.',
      retentionCutoff: formatUtcDate_(cutoffDate),
      archives: results
    };
    console.log(JSON.stringify(response));
    return response;
  } catch (error) {
    console.error('Google Drive log archive failed: ' + error.stack);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function oldestTimestamp_(table, cutoffIso, properties) {
  const query = [
    'select=created_at',
    'created_at=lt.' + encodeURIComponent(cutoffIso),
    'order=created_at.asc',
    'limit=1'
  ].join('&');
  const rows = supabaseRequest_('GET', '/rest/v1/' + table + '?' + query, null, properties);
  return rows.length ? rows[0].created_at : null;
}

function fetchAllRows_(table, columns, startIso, endIso, properties) {
  const rows = [];

  for (let offset = 0; ; offset += ARCHIVE_CONFIG.pageSize) {
    const query = [
      'select=' + encodeURIComponent(columns),
      'created_at=gte.' + encodeURIComponent(startIso),
      'created_at=lt.' + encodeURIComponent(endIso),
      'order=created_at.asc',
      'limit=' + ARCHIVE_CONFIG.pageSize,
      'offset=' + offset
    ].join('&');
    const page = supabaseRequest_('GET', '/rest/v1/' + table + '?' + query, null, properties);
    Array.prototype.push.apply(rows, page);
    if (page.length < ARCHIVE_CONFIG.pageSize) break;
  }

  return rows;
}

function storeVerifiedArchive_(rootFolder, targetMonth, payload) {
  const year = String(targetMonth.getUTCFullYear());
  const monthNumber = String(targetMonth.getUTCMonth() + 1).padStart(2, '0');
  const monthKey = year + '-' + monthNumber;
  const yearFolder = getOrCreateFolder_(rootFolder, year);
  const monthFolder = getOrCreateFolder_(yearFolder, monthNumber);
  const fileName = 'logs-' + monthKey + '.json.gz';
  const existingFiles = monthFolder.getFilesByName(fileName);
  let reusableFile = null;

  while (existingFiles.hasNext()) {
    const candidate = existingFiles.next();
    if (!reusableFile && archivePayloadMatches_(candidate, payload)) {
      reusableFile = candidate;
    } else {
      candidate.setTrashed(true);
    }
  }

  if (reusableFile) {
    const verified = verifyArchiveFile_(reusableFile, payload);
    return {
      objectKey: year + '/' + monthNumber + '/' + fileName,
      checksum: verified.checksum,
      sizeBytes: verified.sizeBytes,
      fileId: reusableFile.getId(),
      reusedFile: true
    };
  }

  const source = Utilities.newBlob(payload, 'application/json', 'logs-' + monthKey + '.json');
  const compressed = Utilities.gzip(source, fileName);
  const file = monthFolder.createFile(compressed);
  file.setDescription(
    'RFG protected log archive for ' + monthKey + '. Managed automatically; do not edit.'
  );
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  const verified = verifyArchiveFile_(file, payload);

  return {
    objectKey: year + '/' + monthNumber + '/' + fileName,
    checksum: verified.checksum,
    sizeBytes: verified.sizeBytes,
    fileId: file.getId(),
    reusedFile: false
  };
}

function archivePayloadMatches_(file, expectedPayload) {
  try {
    return Utilities.ungzip(file.getBlob()).getDataAsString('UTF-8') === expectedPayload;
  } catch (error) {
    console.warn('Ignoring unreadable archive file ' + file.getId() + ': ' + error.message);
    return false;
  }
}

function verifyArchiveFile_(file, expectedPayload) {
  const blob = file.getBlob();
  const sizeBytes = file.getSize();
  if (sizeBytes <= 0 || blob.getBytes().length !== sizeBytes) {
    throw new Error('Google Drive returned an incomplete archive file.');
  }
  if (Utilities.ungzip(blob).getDataAsString('UTF-8') !== expectedPayload) {
    throw new Error('Google Drive archive content verification failed.');
  }

  return {
    sizeBytes: sizeBytes,
    checksum: sha256Hex_(blob.getBytes())
  };
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  const folder = parent.createFolder(name);
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  return folder;
}

function supabaseRequest_(method, path, body, properties) {
  const url = normalizeSupabaseUrl_(requireProperty_(properties, 'SUPABASE_URL')) + path;
  const serviceRoleKey = requireLegacyServiceRoleKey_(properties);
  const options = {
    method: method.toLowerCase(),
    headers: {
      apikey: serviceRoleKey,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  };

  options.headers.Authorization = 'Bearer ' + serviceRoleKey;

  if (body !== null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error('Supabase returned invalid JSON (HTTP ' + status + ').');
    }
  }

  if (status < 200 || status >= 300) {
    const detail = parsed && (parsed.message || parsed.error_description || parsed.error || parsed.details);
    throw new Error('Supabase returned HTTP ' + status + ': ' + (detail || text || 'Unknown error'));
  }

  return parsed === null ? {} : parsed;
}

function requireProperty_(properties, name) {
  const value = String(properties.getProperty(name) || '').trim();
  if (!value) throw new Error('Missing Script Property: ' + name);
  return value;
}

function requireLegacyServiceRoleKey_(properties) {
  const value = requireProperty_(properties, 'SUPABASE_SERVICE_ROLE_KEY');
  if (value.startsWith('sb_secret_')) {
    throw new Error(
      'Google Apps Script cannot use an sb_secret key because Supabase blocks '
      + 'browser-like User-Agent requests. Replace SUPABASE_SERVICE_ROLE_KEY '
      + 'with the Legacy API Keys service_role JWT.'
    );
  }
  if (value.split('.').length !== 3) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must contain the Legacy service_role JWT, '
      + 'not the publishable, anon, or sb_secret key.'
    );
  }
  return value;
}

function normalizeSupabaseUrl_(value) {
  return value.replace(/\/+$/, '');
}

function getMaxMonthsPerRun_(properties) {
  const configured = Number(properties.getProperty('MAX_MONTHS_PER_RUN'));
  const value = Number.isFinite(configured) && configured > 0
    ? configured
    : ARCHIVE_CONFIG.defaultMaxMonthsPerRun;
  return Math.min(Math.floor(value), ARCHIVE_CONFIG.maximumMonthsPerRun);
}

function utcMonthStart_(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths_(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatUtcMonth_(date) {
  return date.toISOString().slice(0, 7);
}

function formatUtcDate_(date) {
  return date.toISOString().slice(0, 10);
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (value) {
      return ((value + 256) % 256).toString(16).padStart(2, '0');
    })
    .join('');
}
