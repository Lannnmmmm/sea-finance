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


/** Menampilkan antarmuka impor PDF. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SeaBank PDF Importer')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Menyimpan satu statement setelah validasi di sisi server.
 * Payload: {reference, periodStart, periodEnd, openingBalance,
 *           totalOutgoing, totalIncoming, endingBalance, transactions[]}
 */
function importStatements(payload) {
  if(!payload||!Array.isArray(payload.statements)||!payload.statements.length)throw new Error('Tidak ada statement untuk diimpor.');
  payload.statements.forEach(validateImportPayload_);
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try{
    const ss=SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID), txSheet=ss.getSheetByName(CONFIG.TRANSACTIONS_SHEET), historySheet=ss.getSheetByName(CONFIG.IMPORT_HISTORY_SHEET);
    if(!txSheet||!historySheet)throw new Error('Jalankan setupSeaBankSheets() terlebih dahulu.');
    const last=historySheet.getLastRow(), existing=last>1?historySheet.getRange(2,1,last-1,1).getDisplayValues().flat():[];
    const refs=payload.statements.map(s=>s.reference), duplicates=refs.filter((r,i)=>refs.indexOf(r)!==i||existing.includes(r));
    if(duplicates.length)throw new Error('Statement duplikat: '+[...new Set(duplicates)].join(', ')+'. Tidak ada data yang disimpan.');
    const rows=[], histories=[];
    payload.statements.forEach(s=>{
      s.transactions.forEach(t=>rows.push([s.reference,t.date,t.transaction||'',t.transactionType||'',t.account||'',Number(t.outgoing||0),Number(t.incoming||0),Number(t.endingBalance),'']));
      histories.push([s.reference,s.periodStart,s.periodEnd,s.transactions.length,new Date(),'SUCCESS','Totals, ending balance and running balance matched']);
    });
    if(!rows.length)throw new Error('Data transaksi kosong.');
    txSheet.getRange(txSheet.getLastRow()+1,1,rows.length,CONFIG.TRANSACTION_HEADERS.length).setValues(rows);
    historySheet.getRange(historySheet.getLastRow()+1,1,histories.length,CONFIG.IMPORT_HISTORY_HEADERS.length).setValues(histories);
    return {success:true,imported:rows.length,statements:histories.length};
  }finally{lock.releaseLock();}
}
function validateImportPayload_(p) {
  if(!p||!/^S\\d{2}-\\d{6}[A-Z0-9]{8}$/.test(String(p.reference||'')))throw new Error('Nomor reference statement tidak valid: '+(p&&p.reference||''));
  if(!Array.isArray(p.transactions)||!p.transactions.length)throw new Error('Tidak ada transaksi: '+p.reference);
  p.transactions.forEach((t,i)=>{
    if(!/^2026-\\d{2}-\\d{2}$/.test(String(t.date||''))||!Number.isFinite(Number(t.outgoing||0))||!Number.isFinite(Number(t.incoming||0))||!Number.isFinite(Number(t.endingBalance))||Number(t.outgoing||0)<0||Number(t.incoming||0)<0)throw new Error('Data transaksi tidak valid pada '+p.reference+', baris '+(i+1));
  });
  const outgoing=p.transactions.reduce((s,t)=>s+Number(t.outgoing||0),0), incoming=p.transactions.reduce((s,t)=>s+Number(t.incoming||0),0), last=p.transactions[p.transactions.length-1];
  if(outgoing!==Number(p.totalOutgoing))throw new Error('Total outgoing tidak cocok: '+p.reference);
  if(incoming!==Number(p.totalIncoming))throw new Error('Total incoming tidak cocok: '+p.reference);
  if(Number(last.endingBalance)!==Number(p.endingBalance))throw new Error('Saldo akhir tidak cocok: '+p.reference);
  let previous=Number(p.openingBalance);
  p.transactions.forEach((t,i)=>{const expected=previous-Number(t.outgoing||0)+Number(t.incoming||0);if(expected!==Number(t.endingBalance))throw new Error('Saldo berjalan gagal pada '+p.reference+', transaksi ke-'+(i+1));previous=Number(t.endingBalance);});
}
