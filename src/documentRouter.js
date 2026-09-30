const { isTelebirrReceipt, parseTelebirrText } = require("./telebirrParser");
const { isMobileWalletScreenshot, parseMobileWalletText } = require("./mobileWalletParser");
const { parseReceiptText } = require("./receiptParser");

/**
 * Detects the document type from raw OCR text and routes to the matching parser.
 * Order matters: more specific/narrow checks should come before broader ones.
 * @param {string} rawText
 * @returns {{ document_type: string, data: object }}
 */
function parseDocument(rawText) {
  if (isMobileWalletScreenshot(rawText)) {
    return { document_type: "mobile_wallet_receipt", data: parseMobileWalletText(rawText) };
  }
  if (isTelebirrReceipt(rawText)) {
    return { document_type: "telebirr_receipt", data: parseTelebirrText(rawText) };
  }
  // Default: generic retail receipt
  return { document_type: "retail_receipt", data: parseReceiptText(rawText) };
}

module.exports = { parseDocument };
