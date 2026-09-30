// Parses Telebirr transaction receipts (Ethio telecom mobile money).
// These are bilingual (Amharic + English) documents where OCR mangles the
// Amharic text but the English field labels and values are usually legible.
// Field extraction here is line-anchored: each field's English label and its
// value sit on the same OCR line, so we search line-by-line rather than
// treating the whole document as free text.

const KNOWN_PAYMENT_REASONS = [
  "Customer Transfer from Mobile Money",
  "Merchant Payment",
  "Bill Payment",
  "Cash In",
  "Cash Out",
  "Airtime Purchase",
];

function isTelebirrReceipt(rawText) {
  return /telebirr/i.test(rawText);
}

function findLine(lines, labelRegex) {
  return lines.find((l) => labelRegex.test(l)) || null;
}

function afterLabel(line, labelRegex) {
  if (!line) return null;
  const match = line.match(labelRegex);
  if (!match) return null;
  return line.slice(match.index + match[0].length).trim() || null;
}

function stopAtSlash(str) {
  if (!str) return str;
  const idx = str.indexOf("/");
  return idx === -1 ? str.trim() : str.slice(0, idx).trim();
}

function extractBirrAmount(line, labelRegex) {
  if (!line) return null;
  const rest = afterLabel(line, labelRegex);
  if (!rest) return null;
  const match = rest.match(/([\d,]+\.?\d*)\s*Birr/i);
  return match ? parseFloat(match[1].replace(/,/g, "")) : null;
}

function parseTelebirrText(rawText) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const notes = [];

  const payerNameLine = findLine(lines, /Payer Name/i);
  const payerPhoneLine = findLine(lines, /Payer telebirr no\.?/i);
  const payerAccountTypeLine = findLine(lines, /Payer account type/i);
  const creditedNameLine = findLine(lines, /Credited Party name/i);
  const creditedAccountLine = findLine(lines, /Credited party account no/i);
  const statusLine = findLine(lines, /transaction status/i);
  const bankAccountLine = findLine(lines, /Bank account number/i);
  const stampDutyLine = findLine(lines, /Stamp Duty/i);
  const discountLine = findLine(lines, /Discount Amount/i);
  const serviceFeeLine = findLine(lines, /Service fee(?!\s*VAT)/i);
  const serviceFeeVatLine = findLine(lines, /Service fee\s*VAT/i);
  const totalPaidLine = findLine(lines, /Total Paid Amount/i);
  const totalWordsLine = findLine(lines, /Total Amount in word/i);
  const paymentModeLine = findLine(lines, /Payment Mode/i);
  const paymentReasonLine = findLine(lines, /Payment Reason/i);
  const customerNoteLine = findLine(lines, /Customer Note/i);

  // Invoice No / Payment date / Settled Amount are printed as a data row
  // beneath a header row, e.g.: "DIO63HEM3W 24-09-2026 12:16:23 277 Birr"
  const dataRowMatch = rawText.match(
    /([A-Z0-9]{6,})\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2}:\d{2})\s+([\d,]+\.?\d*)\s*Birr/i
  );

  const bankAccountMatch = bankAccountLine
    ? bankAccountLine.match(/Bank account number\s+(\d+)\s*(.*)/i)
    : null;

  const paymentReason =
    KNOWN_PAYMENT_REASONS.find((r) => rawText.includes(r)) || null;
  if (!paymentReason && paymentReasonLine) {
    notes.push("Payment reason line found but did not match a known reason phrase.");
  }

  const totalPaidAmount = extractBirrAmount(totalPaidLine, /Total Paid Amount/i);
  if (totalPaidAmount === null) notes.push("Could not confidently locate the total paid amount.");

  const result = {
    document_type: "telebirr_receipt",
    currency: "ETB",
    payer_name: stopAtSlash(afterLabel(payerNameLine, /Payer Name/i)),
    payer_phone: afterLabel(payerPhoneLine, /Payer telebirr no\.?/i),
    payer_account_type: stopAtSlash(afterLabel(payerAccountTypeLine, /Payer account type/i)),
    credited_party_name: stopAtSlash(afterLabel(creditedNameLine, /Credited Party name/i)),
    credited_party_account_no: afterLabel(creditedAccountLine, /Credited party account no/i)?.split(/\s+/)[0] || null,
    transaction_status: stopAtSlash(afterLabel(statusLine, /transaction status/i)),
    bank_account_number: bankAccountMatch ? bankAccountMatch[1] : null,
    bank_account_holder_name: bankAccountMatch ? bankAccountMatch[2].trim() || null : null,
    invoice_no: dataRowMatch ? dataRowMatch[1] : null,
    payment_date: dataRowMatch ? `${dataRowMatch[2]} ${dataRowMatch[3]}` : null,
    settled_amount: dataRowMatch ? parseFloat(dataRowMatch[4].replace(/,/g, "")) : null,
    stamp_duty: extractBirrAmount(stampDutyLine, /Stamp Duty/i),
    discount_amount: extractBirrAmount(discountLine, /Discount Amount/i),
    service_fee: extractBirrAmount(serviceFeeLine, /Service fee(?!\s*VAT)/i),
    service_fee_vat: extractBirrAmount(serviceFeeVatLine, /Service fee\s*VAT/i),
    total_paid_amount: totalPaidAmount,
    total_amount_in_words: afterLabel(totalWordsLine, /Total Amount in word/i),
    payment_mode: paymentModeLine && /telebirr/i.test(paymentModeLine) ? "telebirr" : null,
    payment_reason: paymentReason,
    customer_note: stopAtSlash(afterLabel(customerNoteLine, /Customer Note/i)),
    confidence_notes: notes.length ? notes.join(" ") : null,
  };

  return result;
}

module.exports = { isTelebirrReceipt, parseTelebirrText };
