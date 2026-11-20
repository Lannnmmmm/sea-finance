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
    'classification_status','import_id','transaction_hash','notes','transfer_purpose'
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
    'category_id','transaction_type','requires_review','is_active','notes','direction'
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
    ['INC_OTHER','Pendapatan Lainnya (perlu rincian)','INCOME','',true],
    ['INC_DRIVER','Pendapatan Driver','INCOME','',true],
    ['INC_TECH_SERVICE','Jasa Teknologi','INCOME','',true],
    ['INC_FREELANCE','Pendapatan Freelance','INCOME','',true],
    ['EXP_FOOD','Makanan & Minuman','EXPENSE','',true],
    ['EXP_TRANSPORT','Transportasi','EXPENSE','',true],
    ['EXP_BILLS','Tagihan & Utilitas','EXPENSE','',true],
    ['EXP_EWALLET','Belanja E-Wallet','EXPENSE','',true],
    ['EXP_ADMIN','Biaya Administrasi','EXPENSE','',true],
    ['EXP_TAX','Pajak','EXPENSE','',true],
    ['EXP_OTHER','Pengeluaran Lainnya','EXPENSE','',true],
    ['TR_INTERNAL','Transfer Internal','TRANSFER','',true],
    ['ASSET_DEPOSIT','Penempatan/Pencairan Deposito','ASSET','',true],
    ['TR_EXTERNAL','Transfer dengan Pihak Lain','TRANSFER','',true],
    ['EXP_VAPE','Belanja Pribadi - Rokok Elektrik','EXPENSE','',true],
    ['EXP_HOUSEHOLD','Kebutuhan Rumah Tangga','EXPENSE','',true],
    ['EXP_PET','Kebutuhan Hewan Peliharaan','EXPENSE','',true],
    ['ASSET_INVESTMENT','Investasi / Aset','ASSET','',true],
    ['EXP_PERSONAL','Belanja Pribadi','EXPENSE','',true],
    ['EXP_MARKETPLACE','Belanja Marketplace (Campuran)','EXPENSE','',true],
    ['EXP_PURCHASE','Pembayaran / Pembelian','EXPENSE','',true]
  ];

  const rules = [
    ['RULE_001',1,'description_raw','CONTAINS','PAJAK BUNGA','EXP_TAX','EXPENSE',false,true,'Contoh awal; sesuaikan dengan deskripsi statement'],
    ['RULE_002',2,'description_raw','CONTAINS','BIAYA ADMIN','EXP_ADMIN','EXPENSE',false,true,'Contoh awal; sesuaikan dengan deskripsi statement'],
    ['RULE_003',3,'description_raw','CONTAINS','BUNGA','INC_INTEREST','INCOME',false,true,'Contoh awal; sesuaikan dengan deskripsi statement'],
    ['RULE_004',4,'description_raw','CONTAINS','SAVINGS INTEREST','INC_INTEREST','INCOME',false,true,'Bunga tabungan SeaBank'],
    ['RULE_005',5,'description_raw','CONTAINS','SAVINGS WITHHOLDING TAX','EXP_TAX','TAX',false,true,'Pajak atas bunga tabungan SeaBank'],
    ['RULE_006',6,'description_raw','CONTAINS','AAN MAULANA BRI 023001095396506','TR_INTERNAL','TRANSFER_INTERNAL',true,true,'Transfer ke BRI milik sendiri; tujuan penggunaan perlu dipilih saat review','OUT'],
    ['RULE_007',7,'description_raw','EQUALS','DANA','INC_OTHER','INCOME',true,true,'Dana masuk dari e-wallet; sumber pendapatan perlu dirinci saat review','IN'],
    ['RULE_008',8,'description_raw','EQUALS','SHOPEEPAY','INC_OTHER','INCOME',true,true,'ShopeePay masuk; sumber pendapatan perlu dirinci saat review','IN'],
    ['RULE_009',9,'description_raw','CONTAINS','AFRIZAL JUNAEDI','TR_EXTERNAL','TRANSFER',false,true,'Transfer dengan pihak lain; bukan transfer internal'],
    ['RULE_010',10,'description_raw','CONTAINS','CC VAPOR','EXP_VAPE','EXPENSE',false,true,'Belanja pribadi rokok elektrik'],
    ['RULE_011',11,'description_raw','CONTAINS','QUARTER VAPE STORE','EXP_VAPE','EXPENSE',false,true,'Belanja pribadi rokok elektrik'],
    ['RULE_012',12,'description_raw','CONTAINS','TOKO SAYUR BALAP','EXP_HOUSEHOLD','EXPENSE',false,true,'Kebutuhan rumah tangga'],
    ['RULE_013',13,'description_raw','CONTAINS','TOKO SAHABAT BARU','EXP_HOUSEHOLD','EXPENSE',false,true,'Kebutuhan rumah tangga'],
    ['RULE_014',14,'description_raw','CONTAINS','PET SHOP PBI','EXP_PET','EXPENSE',false,true,'Kebutuhan hewan peliharaan'],
    ['RULE_015',15,'description_raw','CONTAINS','TOKO PAKAN JAYA','EXP_PET','EXPENSE',false,true,'Kebutuhan hewan peliharaan'],
    ['RULE_016',16,'description_raw','CONTAINS','PB JALAN KENDUNG SEMEMI 2','EXP_BILLS','EXPENSE',false,true,'Tagihan/utilitas terkonfirmasi','OUT'],
    ['RULE_017',17,'description_raw','CONTAINS','BITTIME','ASSET_INVESTMENT','ASSET',false,true,'Investasi/aset terkonfirmasi','OUT'],
    ['RULE_018',18,'description_raw','CONTAINS','LYNKID','EXP_PERSONAL','EXPENSE',false,true,'Belanja pribadi terkonfirmasi','OUT'],
    ['RULE_019',19,'description_raw','CONTAINS','SHOPEE','EXP_MARKETPLACE','EXPENSE',false,true,'Belanja marketplace campuran; hanya transaksi keluar','OUT'],
    ['RULE_020',20,'description_raw','CONTAINS','NANIK SETIYAWATI','EXP_PURCHASE','EXPENSE',false,true,'Pembayaran/pembelian terkonfirmasi','OUT'],
    ['RULE_021',21,'description_raw','CONTAINS','EVA CHILMIYATIN','EXP_PURCHASE','EXPENSE',false,true,'Pembayaran/pembelian terkonfirmasi','OUT'],
    ['RULE_022',22,'description_raw','CONTAINS','AFIF ABDILLA','EXP_PURCHASE','EXPENSE',false,true,'Pembayaran/pembelian terkonfirmasi','OUT'],
    ['RULE_023',23,'description_raw','CONTAINS','AAN MAULANA GOPAY','EXP_PURCHASE','EXPENSE',false,true,'Pembayaran langsung melalui GoPay terkonfirmasi','OUT'] 
  ];

  const settings = [
    ['EWALLET_TOPUP_MODE','EXPENSE','EXPENSE = top-up dianggap pengeluaran; TRANSFER = pindah saldo e-wallet'],
    ['DEFAULT_UNMATCHED_STATUS','REVIEW','Transaksi tanpa aturan masuk antrean review'],
    ['CURRENCY','IDR','Nominal disimpan sebagai integer Rupiah'],
    ['TIMEZONE','Asia/Jakarta','Zona waktu laporan']
  ];

  seedRowsIfMissing_(ss.getSheetByName('Categories'), categories, 1);
  seedRowsIfMissing_(ss.getSheetByName('Rules'), rules, 1);
  migrateConfirmedRules_(ss.getSheetByName('Rules'));
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

/**
 * Update only the three rules whose meaning was explicitly reconfirmed.
 * This avoids overwriting unrelated user-customized rules.
 */
function migrateConfirmedRules_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(function(v) { return String(v).trim(); });
  const col = {};
  headers.forEach(function(h, i) { col[h] = i; });
  const updates = {
    RULE_006: { category_id: 'TR_INTERNAL', transaction_type: 'TRANSFER_INTERNAL',
      requires_review: true, direction: 'OUT',
      notes: 'Transfer ke BRI milik sendiri; tujuan penggunaan perlu dipilih saat review' },
    RULE_007: { category_id: 'INC_OTHER', transaction_type: 'INCOME',
      requires_review: true, direction: 'IN',
      notes: 'Dana masuk dari e-wallet; sumber pendapatan perlu dirinci saat review' },
    RULE_008: { category_id: 'INC_OTHER', transaction_type: 'INCOME',
      requires_review: true, direction: 'IN',
      notes: 'ShopeePay masuk; sumber pendapatan perlu dirinci saat review' },
    RULE_004: { category_id: 'INC_INTEREST', transaction_type: 'INCOME',
      requires_review: false, direction: '',
      notes: 'Bunga tabungan SeaBank otomatis' },
    RULE_005: { category_id: 'EXP_TAX', transaction_type: 'TAX',
      requires_review: false, direction: '',
      notes: 'Pajak bunga tabungan SeaBank otomatis' },
    RULE_016: { category_id: 'EXP_BILLS', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Tagihan/utilitas terkonfirmasi' },
    RULE_017: { category_id: 'ASSET_INVESTMENT', transaction_type: 'ASSET',
      requires_review: false, direction: 'OUT', notes: 'Investasi/aset terkonfirmasi' },
    RULE_018: { category_id: 'EXP_PERSONAL', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Belanja pribadi terkonfirmasi' },
    RULE_019: { category_id: 'EXP_MARKETPLACE', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Belanja marketplace campuran; hanya transaksi keluar' },
    RULE_020: { category_id: 'EXP_PURCHASE', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Pembayaran/pembelian terkonfirmasi' },
    RULE_021: { category_id: 'EXP_PURCHASE', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Pembayaran/pembelian terkonfirmasi' },
    RULE_022: { category_id: 'EXP_PURCHASE', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Pembayaran/pembelian terkonfirmasi' },
    RULE_023: { category_id: 'EXP_PURCHASE', transaction_type: 'EXPENSE',
      requires_review: false, direction: 'OUT', notes: 'Pembayaran langsung melalui GoPay terkonfirmasi' }
  };
  for (let r = 1; r < values.length; r++) {
    const id = String(values[r][col.rule_id] || '');
    const patch = updates[id];
    if (!patch) continue;
    Object.keys(patch).forEach(function(key) {
      if (col[key] !== undefined) sheet.getRange(r + 1, col[key] + 1).setValue(patch[key]);
    });
  }
}

function logSetup_(ss, action, sheetName, detail) {
  const sh = ss.getSheetByName('SetupLog');
  sh.appendRow([new Date(), SF_SCHEMA_VERSION, action, sheetName, detail]);
}
