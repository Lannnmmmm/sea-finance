/**
 * Sea-Finance — SeaBank statement parser (preview only)
 * Input: text extracted in the browser with PDF.js.
 * This module NEVER writes parsed rows into Transactions.
 */

function parseSeaBankPreview(extractedText) {
  if (typeof extractedText !== 'string' || extractedText.trim().length < 100) {
    throw new Error('Teks PDF kosong atau terlalu pendek.');
  }

  // PDF.js client must join each page with a form-feed character.
  const pages = extractedText.split('\f');
  const groups = [];
  let current = null;

  pages.forEach(function(pageText) {
    const match = pageText.match(/S\s*\/\s*N\s*(S\d{2}-\d{6}[A-Z0-9]+)/i);
    if (!match) {
      if (current) current.text += '\n' + pageText;
      return;
    }
    const serial = match[1];
    if (!current || current.serial !== serial) {
      current = { serial: serial, text: pageText };
      groups.push(current);
    } else {
      current.text += '\n' + pageText;
    }
  });

  if (!groups.length) return parseSeaBankSinglePreview_(extractedText);
  const statements = groups.map(function(group) {
    return parseSeaBankSinglePreview_(group.text);
  });
  const seen = {};
  const duplicateSerials = [];
  statements.forEach(function(statement) {
    if (statement.statementSerial) {
      if (seen[statement.statementSerial]) duplicateSerials.push(statement.statementSerial);
      seen[statement.statementSerial] = true;
    }
  });
  return {
    ok: statements.length > 0 && statements.every(function(s) { return s.ok; }) && duplicateSerials.length === 0,
    status: statements.length > 0 && statements.every(function(s) { return s.ok; }) && duplicateSerials.length === 0 ? 'VALID' : 'REVIEW',
    statementCount: statements.length,
    duplicateSerials: duplicateSerials,
    statements: statements,
    errors: duplicateSerials.length ? ['Nomor seri statement terdeteksi lebih dari sekali.'] : []
  };
}

function parseSeaBankSinglePreview_(extractedText) {
  if (typeof extractedText !== 'string' || extractedText.trim().length < 100) {
    throw new Error('Teks PDF kosong atau terlalu pendek.');
  }

  const text = extractedText.replace(/\u00a0/g, ' ').replace(/[\r\t]+/g, ' ');
  const lines = text.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);

  const serialMatch = text.match(/S\s*\/\s*N\s*(S\d{2}-\d{6}[A-Z0-9]+)/i);
  const periodMatch = text.match(/(\d{2})\s+([A-Z]{3})\s+(20\d{2})\s+to\s+(\d{2})\s+([A-Z]{3})\s+(20\d{2})/i);
  const summaryLine = lines.find(function(line) { return /^SAVINGS\b/i.test(line) && (line.match(/[\d.]+/g) || []).length >= 4; });
  const summaryValues = summaryLine ? summaryLine.match(/[\d.]+/g) : null;
  const summaryMatch = summaryValues ? [summaryLine].concat(summaryValues.slice(0, 4)) : null;

  if (!serialMatch || !periodMatch || !summaryMatch) {
    return {
      ok: false,
      status: 'REVIEW',
      errors: ['Nomor seri, periode, atau ringkasan saldo tidak ditemukan.'],
      statementSerial: serialMatch ? serialMatch[1] : null,
      transactions: []
    };
  }

  const periodStart = parseSeaBankDate_(periodMatch[1], periodMatch[2], periodMatch[3]);
  const periodEnd = parseSeaBankDate_(periodMatch[4], periodMatch[5], periodMatch[6]);
  const summary = {
    openingBalance: parseSeaBankMoney_(summaryMatch[1]),
    totalOutgoing: parseSeaBankMoney_(summaryMatch[2]),
    totalIncoming: parseSeaBankMoney_(summaryMatch[3]),
    endingBalance: parseSeaBankMoney_(summaryMatch[4])
  };

  const errors = [];
  const summaryDifference = summary.openingBalance + summary.totalIncoming -
    summary.totalOutgoing - summary.endingBalance;
  if (summaryDifference !== 0) {
    errors.push('Ringkasan saldo tidak seimbang: selisih Rp' + summaryDifference);
  }

  const sectionStart = lines.findIndex(function(line) {
    return /SAVINGS\s*-\s*TRANSACTION DETAILS/i.test(line);
  });
  const sectionEnd = lines.findIndex(function(line, index) {
    return index > sectionStart && /TIME DEPOSIT\s*-\s*INTEREST & TAX DETAILS/i.test(line);
  });

  if (sectionStart < 0) {
    errors.push('Bagian SAVINGS - TRANSACTION DETAILS tidak ditemukan.');
  }

  const transactionLines = sectionStart < 0 ? [] :
    lines.slice(sectionStart + 1, sectionEnd < 0 ? lines.length : sectionEnd);

  const transactions = parseSeaBankTransactionLines_(transactionLines, periodStart);
  if (!transactions.length) {
    errors.push('Tidak ada transaksi yang berhasil dikenali.');
  }

  let previousBalance = summary.openingBalance;
  let calculatedOutgoing = 0;
  let calculatedIncoming = 0;

  transactions.forEach(function(tx, index) {
    if (tx.balanceAfter === null) {
      tx.validation = 'REVIEW';
      tx.validationMessage = 'Saldo akhir transaksi tidak terbaca.';
      return;
    }
    const delta = tx.balanceAfter - previousBalance;
    if (delta > 0) {
      tx.direction = 'IN';
      tx.amount = delta;
      calculatedIncoming += delta;
    } else if (delta < 0) {
      tx.direction = 'OUT';
      tx.amount = Math.abs(delta);
      calculatedOutgoing += Math.abs(delta);
    } else {
      tx.direction = 'UNKNOWN';
      tx.amount = 0;
    }
    tx.validation = tx.amount === tx.extractedAmount ? 'OK' : 'REVIEW';
    tx.validationMessage = tx.validation === 'OK' ? '' :
      'Nominal mutasi tidak cocok dengan perubahan saldo (baris ' + (index + 1) + ').';
    previousBalance = tx.balanceAfter;
  });

  const endingDifference = previousBalance - summary.endingBalance;
  if (endingDifference !== 0) {
    errors.push('Saldo transaksi terakhir berbeda dari saldo akhir statement: Rp' + endingDifference);
  }
  if (calculatedOutgoing !== summary.totalOutgoing) {
    errors.push('Total outgoing hasil parsing tidak cocok dengan ringkasan.');
  }
  if (calculatedIncoming !== summary.totalIncoming) {
    errors.push('Total incoming hasil parsing tidak cocok dengan ringkasan.');
  }

  const hasRowReview = transactions.some(function(tx) { return tx.validation !== 'OK'; });
  const ok = errors.length === 0 && !hasRowReview;

  return {
    ok: ok,
    status: ok ? 'VALID' : 'REVIEW',
    statementSerial: serialMatch[1],
    periodStart: periodStart,
    periodEnd: periodEnd,
    summary: summary,
    parsedTotals: {
      outgoing: calculatedOutgoing,
      incoming: calculatedIncoming,
      endingBalance: previousBalance
    },
    transactionCount: transactions.length,
    transactions: transactions,
    errors: errors
  };
}

function parseSeaBankTransactionLines_(lines, periodStart) {
  const monthMap = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
  };
  const result = [];
  let descriptionBuffer = [];

  lines.forEach(function(line) {
    if (/^DATE\s+TRANSACTION/i.test(line) || /^END BALANCE/i.test(line) ||
        /^page\s+\d+/i.test(line) || /^General$/i.test(line)) return;

    const dateMatch = line.match(/^(\d{2})\s+([A-Z]{3})\b\s*(.*)$/i);
    if (!dateMatch) {
      if (!/^TOTAL:/i.test(line) && !/^NO TRANSACTION$/i.test(line)) {
        descriptionBuffer.push(line);
      }
      return;
    }

    const day = Number(dateMatch[1]);
    const month = monthMap[dateMatch[2].toUpperCase()];
    if (month === undefined) {
      descriptionBuffer.push(line);
      return;
    }

    const rest = dateMatch[3] || '';
    const moneyTokens = rest.match(/\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b/g) || [];
    if (moneyTokens.length < 2) {
      descriptionBuffer.push(line);
      return;
    }

    const extractedAmount = parseSeaBankMoney_(moneyTokens[moneyTokens.length - 2]);
    const balanceAfter = parseSeaBankMoney_(moneyTokens[moneyTokens.length - 1]);
    const firstMoneyIndex = rest.search(/\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b/);
    const inlineDescription = firstMoneyIndex >= 0 ? rest.slice(0, firstMoneyIndex).trim() : rest.trim();
    const description = descriptionBuffer.concat(inlineDescription ? [inlineDescription] : [])
      .join(' ').replace(/\s+/g, ' ').trim();

    const year = Number(periodStart.slice(0, 4));
    const txDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    result.push({
      transactionDate: txDate,
      descriptionRaw: description || 'UNPARSED DESCRIPTION',
      extractedAmount: extractedAmount,
      amount: null,
      direction: 'UNKNOWN',
      balanceAfter: balanceAfter,
      validation: 'REVIEW',
      validationMessage: ''
    });
    descriptionBuffer = [];
  });

  return result;
}

function parseSeaBankMoney_(value) {
  return Number(String(value).replace(/\./g, '').replace(/,/g, '').trim());
}

function parseSeaBankDate_(day, month, year) {
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };
  return String(year) + '-' + monthMap[String(month).toUpperCase()] + '-' +
    String(day).padStart(2, '0');
}
