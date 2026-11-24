/**
 * pdf-convert-sheet
 * Fondasi penyimpanan e-Statement SeaBank ke Google Sheets.
 *
 * Aman untuk spreadsheet lama:
 * - Tidak menghapus atau mengubah sheet Pockito.
 * - Hanya membuat sheet "SeaBank" dan "Import History" jika belum ada.
 * - Jika sheet sudah ada dan kosong, header akan dibuat.
 * - Jika sheet sudah berisi data, tidak ditimpa.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1pZWfPVVbnRwY1HSJ9Fnywru_ySpCYNZPHQ2we_1LaE0',
  TRANSACTIONS_SHEET: 'SeaBank',
  IMPORT_HISTORY_SHEET: 'Import History',
  TRANSACTION_HEADERS: [
    'No. Reference',
    'Date',
    'Transaction',
    'Transaction Type',
    'Account',
    'Outgoing (IDR)',
    'Incoming (IDR)',
    'Ending Balance (IDR)',
    'Flagging'
  ],
  IMPORT_HISTORY_HEADERS: [
    'No. Reference',
    'Period Start',
    'Period End',
    'Transaction Count',
    'Imported At',
    'Import Status',
    'Validation'
  ]
});

/**
 * Jalankan sekali untuk menyiapkan dua sheet.
 * Fungsi ini tidak menghapus atau membersihkan data yang sudah ada.
 */
function setupSeaBankSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const transactionsSheet = getOrCreateSheet_(ss, CONFIG.TRANSACTIONS_SHEET);
  const historySheet = getOrCreateSheet_(ss, CONFIG.IMPORT_HISTORY_SHEET);

  ensureHeaders_(transactionsSheet, CONFIG.TRANSACTION_HEADERS);
  ensureHeaders_(historySheet, CONFIG.IMPORT_HISTORY_HEADERS);

  formatSheet_(transactionsSheet, CONFIG.TRANSACTION_HEADERS.length);
  formatSheet_(historySheet, CONFIG.IMPORT_HISTORY_HEADERS.length);

  const result = {
    spreadsheet: ss.getName(),
    transactionsSheet: transactionsSheet.getName(),
    importHistorySheet: historySheet.getName(),
    transactionRows: Math.max(0, transactionsSheet.getLastRow() - 1),
    importHistoryRows: Math.max(0, historySheet.getLastRow() - 1)
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** Tes akses tanpa mengubah isi spreadsheet. */
function testConnection() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  Logger.log('Koneksi berhasil: ' + ss.getName());
  Logger.log('Sheets: ' + ss.getSheets().map(s => s.getName()).join(', '));
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeaders_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const matches = headers.every((header, index) => existing[index] === header);

  if (!matches) {
    throw new Error(
      'Sheet "' + sheet.getName() +
      '" sudah berisi data dengan header berbeda. Tidak ada data yang diubah.'
    );
  }
}

function formatSheet_(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setFontWeight('bold')
    .setWrap(true);

  if (sheet.getFilter() === null && sheet.getLastRow() > 1) {
    sheet.getRange(1, 1, sheet.getLastRow(), columnCount).createFilter();
  }

  sheet.autoResizeColumns(1, columnCount);
}
