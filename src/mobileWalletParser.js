// Parses mobile wallet "transfer confirmation" screenshots — the clean
// in-app success screens (e.g. "Successful", an amount, then a list of
// Transaction Time / Type / To / Number rows). Unlike the printed Telebirr
// invoice format, these are digital screenshots, so OCR text tends to be
// clean and line-based, making simple "label: value" line matching enough.

function isMobileWalletScreenshot(rawText) {
  // Require both labels together so we don't misfire on unrelated text
  // that happens to mention "transaction" once.
  return /Transaction Number/i.test(rawText) && /Transaction Time/i.test(rawText);
}

function afterLabel(lines, labelRegexSource) {
  // [:.]? — accepts a colon OR a period after the label (OCR sometimes
  // misreads ":" as "."), and trims any leftover punctuation/whitespace
  // from the start of the captured value as a safety net.
  const labelRegex = new RegExp(`${labelRegexSource}\\s*[:.]?\\s*(.*)`, "i");
  for (const line of lines) {
    const match = line.match(labelRegex);
    if (match) {
      const value = match[1].replace(/^[.:\s]+/, "").trim();
      return value || null;
    }
  }
  return null;
}

function parseMobileWalletText(rawText) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const notes = [];

  // Status: look for a line that's just a status word like "Successful".
  const statusLine = lines.find((l) => /^(successful|failed|pending)$/i.test(l));
  const status = statusLine ? statusLine.trim() : null;

  // Amount: matches formats like "-21.00 (ETB)", "21.00 ETB", or OCR
  // artifacts like "-21 .00 (ETB)" where a stray space sneaks in around
  // the decimal point.
  const amountMatch = rawText.match(/(-?[\d,]+\s*\.\s*\d{2})\s*\(?\s*([A-Z]{3})\s*\)?/);
  const amount = amountMatch
    ? Math.abs(parseFloat(amountMatch[1].replace(/[\s,]/g, "")))
    : null;
  const currency = amountMatch ? amountMatch[2] : null;

  const transactionTime = afterLabel(lines, "Transaction Time");
  const transactionType = afterLabel(lines, "Transaction Type");
  const transactionTo = afterLabel(lines, "Transaction To");
  const transactionNumber = afterLabel(lines, "Transaction Number");

  if (amount === null) notes.push("Could not confidently locate the amount.");
  if (!transactionNumber) notes.push("Could not confidently locate the transaction number.");

  return {
    document_type: "mobile_wallet_receipt",
    status,
    amount,
    currency,
    transaction_time: transactionTime,
    transaction_type: transactionType,
    transaction_to: transactionTo,
    transaction_number: transactionNumber,
    confidence_notes: notes.length ? notes.join(" ") : null,
  };
}

module.exports = { isMobileWalletScreenshot, parseMobileWalletText };
