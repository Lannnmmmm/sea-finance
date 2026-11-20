/**
 * Sea-Finance — Database bootstrap
 * Safe to run repeatedly: creates missing sheets/headers and seeds defaults only
 * when a sheet contains headers only / is empty. Never clears transaction rows.
 */

const SF_SCHEMA_VERSION = '1.0.0';

const SF_SHEETS = {
  Transactions: [
    'transaction_id','transaction_date','description_raw','transaction_type',
    'direction','amount_idr','balance_after_idr','category_id','counterparty',
    'classification_status','import_id','transaction_hash','notes'
  ],
  Imports: [
    'import_id','source_file_id','statement_serial','period_start','period_end',
    'opening_balance_idr','total_outgoing_idr','total_incoming_idr',
    'ending_balance_idr','imported_at','import_status','validation_message'
  ],
  Categories: [
    'category_id','category_name','category_type','parent_category_id','is_active'
  ],
  Rules: [
    'rule_id','priority','match_field','match_operator','match_value',
    'category_id','transaction_type','requires_review','is_active','notes'
  ],
  Settings: ['setting_key','setting_value','description'],
  TimeDeposits: [
    'deposit_id','statement_import_id','deposit_reference','principal_idr',
    'tenure','maturity_date','interest_rate_pa','status'
  ],
  DepositInterest: [
    'deposit_interest_id','deposit_id','payment_date','gross_interest_idr',
    'withholding_tax_idr','net_interest_idr'
  ],
  SetupLog: ['timestamp','schema_version','action','sheet_name','detail']
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sea-Finance')
    .addItem('Setup / Periksa Database', 'setupDatabase')
    .addItem('Periksa Struktur Sheet', 'checkDatabase')
    .addToUi();
}

/**
 * First run creates all required sheets.
 * Subsequent runs only append missing headers and missing default records.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = [];

  Object.keys(SF_SHEETS).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    const created = !sh;
    if (!sh) sh = ss.insertSheet(name);

    const result = ensureHeaders_(sh, SF_SHEETS[name]);
    report.push({
      sheet: name,
      created: created,
      addedHeaders: result.added,
      unchanged: result.added.length === 0 && !created
    });
  });

  seedDefaults_(ss);
  logSetup_(ss, 'SETUP', 'ALL', JSON.stringify(report));

  SpreadsheetApp.getUi().alert(
    'Sea-Finance database siap.\n\n' +
    report.map(function(x) {
      return (x.created ? '+ Dibuat: ' : '✓ Ada: ') + x.sheet +
        (x.addedHeaders.length ? ' (kolom ditambahkan: ' + x.addedHeaders.join(', ') + ')' : '');
    }).join('\n') +
    '\n\nData transaksi yang sudah ada tidak dihapus.'
  );
}

function checkDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lines = [];

  Object.keys(SF_SHEETS).forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (!sh) {
      lines.push('✗ Sheet belum ada: ' + name);
      return;
    }
    const headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1))
      .getDisplayValues()[0].filter(String);
    const missing = SF_SHEETS[name].filter(function(h) {
      return headers.indexOf(h) === -1;
    });
    lines.push((missing.length ? '⚠ ' : '✓ ') + name +
      (missing.length ? ' — kolom kurang: ' + missing.join(', ') : ' — OK'));
  });

  SpreadsheetApp.getUi().alert('Pemeriksaan Sea-Finance\n\n' + lines.join('\n'));
}

function ensureHeaders_(sheet, requiredHeaders) {
  const lastCol = sheet.getLastColumn();
  const existing = lastCol
    ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    : [];
  const normalized = existing.map(function(v) {
    return String(v).trim();
  });
  const added = [];

  requiredHeaders.forEach(function(header) {
    if (normalized.indexOf(header) === -1) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(header);
      added.push(header);
    }
  });

  const finalCols = sheet.getLastColumn();
  if (finalCols > 0) {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, finalCols)
      .setFontWeight('bold')
      .setBackground('#17365D')
      .setFontColor('#FFFFFF')
      .setWrap(true);
    sheet.autoResizeColumns(1, finalCols);
  }

  return { added: added };
}

function seedDefaults_(ss) {
  const categories = [
    ['INC_SALARY','Gaji','INCOME','',true],
    ['INC_INTEREST','Bunga tabungan/deposito','INCOME','',true],
    ['INC_OTHER','Pemasukan Lainnya','INCOME','',true],
    ['EXP_FOOD','Makanan & Minuman','EXPENSE','',true],
    ['EXP_TRANSPORT','Transportasi','EXPENSE','',true],
    ['EXP_BILLS','Tagihan & Utilitas','EXPENSE','',true],
    ['EXP_EWALLET','Belanja E-Wallet','EXPENSE','',true],
    ['EXP_ADMIN','Biaya Administrasi','EXPENSE','',true],
    ['EXP_TAX','Pajak','EXPENSE','',true],
    ['EXP_OTHER','Pengeluaran Lainnya','EXPENSE','',true],
    ['TR_INTERNAL','Transfer Internal','TRANSFER','',true],
    ['ASSET_DEPOSIT','Penempatan/Pencairan Deposito','ASSET','',true]
  ];

  const rules = [
    ['RULE_001',1,'description_raw','CONTAINS','PAJAK BUNGA','EXP_TAX','EXPENSE',false,true,'Contoh awal; sesuaikan dengan deskripsi statement'],
    ['RULE_002',2,'description_raw','CONTAINS','BIAYA ADMIN','EXP_ADMIN','EXPENSE',false,true,'Contoh awal; sesuaikan dengan deskripsi statement'],
    ['RULE_003',3,'description_raw','CONTAINS','BUNGA','INC_INTEREST','INCOME',false,true,'Contoh awal; sesuaikan dengan deskripsi statement'],
    ['RULE_004',4,'description_raw','CONTAINS','SAVINGS INTEREST','INC_INTEREST','INCOME',false,true,'Bunga tabungan SeaBank'],
    ['RULE_005',5,'description_raw','CONTAINS','SAVINGS WITHHOLDING TAX','EXP_TAX','TAX',false,true,'Pajak atas bunga tabungan SeaBank'],
    ['RULE_006',6,'description_raw','CONTAINS','AAN MAULANA BRI 023001095396506','TR_INTERNAL','TRANSFER_INTERNAL',false,true,'Transfer ke rekening BRI milik sendiri yang telah dikonfirmasi pengguna']
  ];

  const settings = [
    ['EWALLET_TOPUP_MODE','EXPENSE','EXPENSE = top-up dianggap pengeluaran; TRANSFER = pindah saldo e-wallet'],
    ['DEFAULT_UNMATCHED_STATUS','REVIEW','Transaksi tanpa aturan masuk antrean review'],
    ['CURRENCY','IDR','Nominal disimpan sebagai integer Rupiah'],
    ['TIMEZONE','Asia/Jakarta','Zona waktu laporan']
  ];

  seedRowsIfMissing_(ss.getSheetByName('Categories'), categories, 1);
  seedRowsIfMissing_(ss.getSheetByName('Rules'), rules, 1);
  seedRowsIfMissing_(ss.getSheetByName('Settings'), settings, 1);
}

function seedRowsIfMissing_(sheet, rows, keyColumn) {
  const lastRow = sheet.getLastRow();
  const existingKeys = lastRow > 1
    ? sheet.getRange(2, keyColumn, lastRow - 1, 1).getDisplayValues().flat()
    : [];

  rows.forEach(function(row) {
    if (existingKeys.indexOf(String(row[keyColumn - 1])) === -1) {
      sheet.appendRow(row);
    }
  });
}

function logSetup_(ss, action, sheetName, detail) {
  const sh = ss.getSheetByName('SetupLog');
  sh.appendRow([new Date(), SF_SCHEMA_VERSION, action, sheetName, detail]);
}
