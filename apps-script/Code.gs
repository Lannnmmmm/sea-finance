/**
 * Sea-Finance — Core backend
 * API dasar untuk dashboard dan review transaksi.
 *
 * Catatan:
 * - Script ini dirancang sebagai container-bound Apps Script pada Spreadsheet.
 * - Tidak melakukan parsing PDF atau mengubah transaksi.
 * - Semua nominal disimpan sebagai integer Rupiah.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Import')
    .evaluate()
    .setTitle('Sea-Finance · Import Preview')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Data awal yang dibutuhkan UI dalam satu pemanggilan.
 */
function getAppBootstrap() {
  const ss = getDatabase_();
  const settings = readKeyValueSheet_(ss, 'Settings', 'setting_key', 'setting_value');
  const categories = readSheetObjects_(ss, 'Categories')
    .filter(function(row) { return isTruthy_(row.is_active); });
  const transactions = readSheetObjects_(ss, 'Transactions');
  const imports = readSheetObjects_(ss, 'Imports');

  const reviewQueue = transactions
    .filter(function(row) {
      return String(row.classification_status || '').toUpperCase() === 'REVIEW';
    })
    .sort(function(a, b) {
      return dateSortValue_(b.transaction_date) - dateSortValue_(a.transaction_date);
    })
    .slice(0, 20);

  const recentTransactions = transactions
    .sort(function(a, b) {
      return dateSortValue_(b.transaction_date) - dateSortValue_(a.transaction_date);
    })
    .slice(0, 10);

  return {
    appName: 'Sea-Finance',
    schemaVersion: typeof SF_SCHEMA_VERSION !== 'undefined' ? SF_SCHEMA_VERSION : 'unknown',
    spreadsheetName: ss.getName(),
    settings: settings,
    categories: categories,
    reviewQueue: reviewQueue,
    recentTransactions: recentTransactions,
    counts: {
      transactions: transactions.length,
      needsReview: transactions.filter(function(row) {
        return String(row.classification_status || '').toUpperCase() === 'REVIEW';
      }).length,
      imports: imports.length,
      failedImports: imports.filter(function(row) {
        return ['FAILED', 'REVIEW'].indexOf(String(row.import_status || '').toUpperCase()) !== -1;
      }).length
    }
  };
}

/**
 * Klasifikasi preview berdasarkan Rules sheet.
 * Tidak menyimpan atau mengubah data transaksi.
 */
function classifyPreviewResult(result) {
  if (!result || !Array.isArray(result.statements)) {
    throw new Error('Hasil preview tidak valid.');
  }
  const ss = getDatabase_();
  const rules = readSheetObjects_(ss, 'Rules')
    .filter(function(rule) { return isTruthy_(rule.is_active); })
    .sort(function(a, b) { return Number(a.priority || 9999) - Number(b.priority || 9999); });
  const categories = {};
  readSheetObjects_(ss, 'Categories').forEach(function(category) {
    categories[String(category.category_id)] = category.category_name;
  });

  let autoCount = 0;
  let reviewCount = 0;
  result.statements.forEach(function(statement) {
    (statement.transactions || []).forEach(function(tx) {
      const description = String(tx.descriptionRaw || '').toUpperCase();
      const bankType = String(tx.transactionType || '').toUpperCase();
      let matched = null;

      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const field = String(rule.match_field || '').toLowerCase();
        const source = field === 'transaction_type' ? bankType :
          field === 'direction' ? String(tx.direction || '').toUpperCase() : description;
        const expected = String(rule.match_value || '').toUpperCase();
        const operator = String(rule.match_operator || 'CONTAINS').toUpperCase();
        let hit = false;
        if (operator === 'CONTAINS') hit = source.indexOf(expected) !== -1;
        else if (operator === 'EQUALS') hit = source === expected;
        else if (operator === 'STARTS_WITH') hit = source.indexOf(expected) === 0;
        if (hit) { matched = rule; break; }
      }

      if (matched) {
        tx.categoryId = String(matched.category_id || '');
        tx.categoryName = categories[tx.categoryId] || 'Kategori tidak ditemukan';
        tx.classifiedType = String(matched.transaction_type || tx.transactionType || '');
        tx.classificationStatus = isTruthy_(matched.requires_review) ? 'REVIEW' : 'AUTO';
        tx.classificationRule = String(matched.rule_id || '');
      } else {
        tx.categoryId = '';
        tx.categoryName = 'Belum diklasifikasi';
        tx.classifiedType = bankType;
        tx.classificationStatus = 'REVIEW';
        tx.classificationRule = '';
      }
      if (tx.classificationStatus === 'AUTO') autoCount++;
      else reviewCount++;
    });
  });
  result.classificationSummary = { auto: autoCount, review: reviewCount };
  return result;
}

/**
 * Mengambil transaksi dengan filter opsional.
 * options: {status, limit}
 */
function getTransactions(options) {
  options = options || {};
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  const status = String(options.status || '').trim().toUpperCase();

  let rows = readSheetObjects_(getDatabase_(), 'Transactions');
  if (status) {
    rows = rows.filter(function(row) {
      return String(row.classification_status || '').toUpperCase() === status;
    });
  }

  rows.sort(function(a, b) {
    return dateSortValue_(b.transaction_date) - dateSortValue_(a.transaction_date);
  });

  return rows.slice(0, limit);
}

/**
 * Membaca daftar impor terbaru.
 */
function getImportHistory(limit) {
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return readSheetObjects_(getDatabase_(), 'Imports')
    .sort(function(a, b) {
      return dateSortValue_(b.imported_at) - dateSortValue_(a.imported_at);
    })
    .slice(0, limit);
}

/**
 * Helper: ambil spreadsheet aktif atau Spreadsheet ID dari Script Properties.
 * Untuk deployment standalone, isi SF_SPREADSHEET_ID di Script Properties.
 */
function getDatabase_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id = PropertiesService.getScriptProperties().getProperty('SF_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  throw new Error(
    'Database belum terhubung. Jalankan script dari Google Spreadsheet atau set SF_SPREADSHEET_ID.'
  );
}

function readSheetObjects_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + sheetName);

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(value) {
    return String(value).trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) { return cell !== '' && cell !== null; });
    })
    .map(function(row) {
      const item = {};
      headers.forEach(function(header, index) {
        if (header) item[header] = normalizeApiValue_(row[index]);
      });
      return item;
    });
}

function readKeyValueSheet_(ss, sheetName, keyHeader, valueHeader) {
  const rows = readSheetObjects_(ss, sheetName);
  const result = {};
  rows.forEach(function(row) {
    const key = row[keyHeader];
    if (key !== '' && key !== null && key !== undefined) {
      result[String(key)] = row[valueHeader];
    }
  });
  return result;
}

function normalizeApiValue_(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function dateSortValue_(value) {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function isTruthy_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE' || String(value) === '1';
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
