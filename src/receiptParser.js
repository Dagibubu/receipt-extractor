// Turns raw OCR text into the same structured shape the Claude-vision
// pipeline produced, using regex heuristics. This is inherently fuzzier
// than LLM-based extraction — tune these patterns against real receipts
// from your use case as you find misses.

const MONEY_RE = /(-?\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{2}))/;
const DATE_RE = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
const TIME_RE = /\b(\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp][Mm])?)\b/;
const CURRENCY_SYMBOLS = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };

const LABELS = {
  subtotal: /\b(sub[\s-]?total)\b/i,
  tax: /\b(tax|vat|gst)\b/i,
  tip: /\b(tip|gratuity)\b/i,
  total: /\b(total|amount due|balance due)\b/i,
};

const PAYMENT_RE = /\b(visa|mastercard|amex|american express|discover|cash|debit|credit)\b.{0,20}/i;
const TRANSACTION_ID_RE = /\b(?:receipt|transaction|trans|order|ref|reference|invoice)\s*(?:#|no\.?|id|number)?\s*[:#]?\s*([A-Z0-9\-]{4,})\b/i;

function toNumber(str) {
  if (!str) return null;
  // Normalize "1,234.56" or "1.234,56"-style strings to a plain float.
  const cleaned = str.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function findLabeledAmount(lines, labelRegex) {
  for (const line of lines) {
    if (labelRegex.test(line)) {
      const match = line.match(MONEY_RE);
      if (match) return toNumber(match[1]);
    }
  }
  return null;
}

function detectCurrency(text) {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return code;
  }
  const codeMatch = text.match(/\b(USD|EUR|GBP|JPY|CAD|AUD)\b/);
  return codeMatch ? codeMatch[1] : null;
}

function extractLineItems(lines) {
  const items = [];
  const skipRe = /subtotal|^tax|^vat|^gst|tip|gratuity|^total|amount due|balance due|change|cash|card|visa|mastercard|thank you|receipt|store|address|phone/i;

  for (const line of lines) {
    if (skipRe.test(line)) continue;
    const moneyMatches = [...line.matchAll(new RegExp(MONEY_RE, "g"))];
    if (moneyMatches.length === 0) continue;

    const lastMoney = moneyMatches[moneyMatches.length - 1];
    const price = toNumber(lastMoney[1]);
    const description = line.slice(0, lastMoney.index).trim().replace(/[.\s]{2,}$/, "");

    if (description && price !== null && description.length > 1) {
      // Try to pull a leading quantity like "2x" or "2 "
      const qtyMatch = description.match(/^(\d+)\s*[xX]?\s+/);
      const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
      const cleanDescription = qtyMatch ? description.slice(qtyMatch[0].length).trim() : description;

      items.push({
        description: cleanDescription,
        quantity: quantity,
        unit_price: quantity ? Math.round((price / quantity) * 100) / 100 : null,
        total_price: price,
      });
    }
  }
  return items;
}

/**
 * Parses raw OCR text into the structured receipt shape.
 * @param {string} rawText
 * @returns {object}
 */
function parseReceiptText(rawText) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const notes = [];

  const merchantName = lines[0] || null;
  const dateMatch = rawText.match(DATE_RE);
  const timeMatch = rawText.match(TIME_RE);
  const paymentMatch = rawText.match(PAYMENT_RE);
  const transactionIdMatch = rawText.match(TRANSACTION_ID_RE);

  const subtotal = findLabeledAmount(lines, LABELS.subtotal);
  const tax = findLabeledAmount(lines, LABELS.tax);
  const tip = findLabeledAmount(lines, LABELS.tip);
  const total = findLabeledAmount(lines, LABELS.total);
  const items = extractLineItems(lines);

  if (total === null) notes.push("Could not confidently locate a total amount.");
  if (items.length === 0) notes.push("Could not confidently identify individual line items.");

  return {
    merchant_name: merchantName,
    merchant_address: lines.length > 1 ? lines[1] : null, // best-effort guess: 2nd line
    transaction_id: transactionIdMatch ? transactionIdMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null,
    time: timeMatch ? timeMatch[1] : null,
    currency: detectCurrency(rawText),
    items,
    subtotal,
    tax,
    tip,
    total,
    payment_method: paymentMatch ? paymentMatch[0].trim() : null,
    confidence_notes: notes.length ? notes.join(" ") : null,
  };
}

module.exports = { parseReceiptText };
