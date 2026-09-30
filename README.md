# Receipt Extractor API (Local OCR)

A small Express API that takes a photo of a receipt and returns structured
JSON using a fully local OCR pipeline — no cloud API calls, no per-image cost.

It supports two document types out of the box, auto-detected per image:
- **Retail receipts** (store purchases: items, subtotal, tax, total)
- **Telebirr receipts** (Ethiopian mobile money transactions: payer, invoice
  no, service fee, VAT, settled/total amount)

## How it works

1. **OCR** (`src/ocrEngine.js`) — [Tesseract.js](https://github.com/naptha/tesseract.js)
   reads the raw text out of the image.
2. **Routing** (`src/documentRouter.js`) — inspects the raw text for
   telltale keywords (e.g. "telebirr") and picks the matching parser.
3. **Parsing** — `src/receiptParser.js` (retail receipts) or
   `src/telebirrParser.js` (Telebirr receipts) turn raw OCR text into
   structured fields using regex/rule-based heuristics.

This is cheaper and fully offline compared to a vision-LLM approach, but it's
also less robust: it relies on keyword matching and known label text.
Unusual layouts, poor photo quality, or unfamiliar document types will
degrade results. Expect to tune the relevant parser's regex patterns against
real documents from your use case — the `raw_text` field returned by the API
is there specifically so you can see what OCR actually read and adjust the
parsing rules accordingly.

## The `summary` field

Every response includes a normalized `summary` block with just the three
fields most integrations actually need — `transaction_id`, `transaction_date`,
and `amount` — mapped from whichever document type was detected, so your app
doesn't need to branch on `document_type` unless it wants the full detail:

```json
"summary": {
  "transaction_id": "DIO63HEM3W",
  "transaction_date": "24-09-2026 12:16:23",
  "amount": 280,
  "currency": "ETB"
}
```

The full parsed fields are still returned under `data` if you need them.

### Adding a new document type

1. Create `src/yourTypeParser.js` with an `isYourType(rawText)` detector and
   a `parseYourType(rawText)` function that returns structured fields.
2. Add a branch for it in `src/documentRouter.js`'s `parseDocument()`.
   Order matters if a document could match more than one detector — put more
   specific checks first.

## Setup

```bash
npm install
npm start
```

No API key needed. Server runs on `http://localhost:3000` by default (set
`PORT` in `.env` to change it).

## API

### `POST /api/extract-receipt`

`multipart/form-data` request with a single field named `image`
(jpeg, png, webp, or gif — max 10MB).

```bash
curl -X POST http://localhost:3000/api/extract-receipt \
  -F "image=@/path/to/receipt.jpg"
```

**Example response (retail receipt):**

```json
{
  "success": true,
  "document_type": "retail_receipt",
  "summary": {
    "transaction_id": null,
    "transaction_date": "09/20/2026 08:15",
    "amount": 10.36,
    "currency": "USD"
  },
  "data": {
    "merchant_name": "BLUE BOTTLE COFFEE",
    "merchant_address": "300 Webster St, Oakland, CA",
    "date": "09/20/2026",
    "time": "08:15",
    "currency": "USD",
    "items": [
      { "description": "Latte", "quantity": null, "unit_price": null, "total_price": 5.50 },
      { "description": "Croissant", "quantity": null, "unit_price": null, "total_price": 4.00 }
    ],
    "subtotal": 9.50,
    "tax": 0.86,
    "tip": null,
    "total": 10.36,
    "payment_method": "visa ending 1234",
    "confidence_notes": null
  },
  "ocr_confidence": 92.4,
  "raw_text": "BLUE BOTTLE COFFEE\n300 Webster St, Oakland, CA\n09/20/2026 08:15\nLatte  5.50\nCroissant  4.00\nSubtotal  9.50\nTax  0.86\nTotal  10.36\n..."
}
```

**Example response (Telebirr receipt):**

```json
{
  "success": true,
  "document_type": "telebirr_receipt",
  "summary": {
    "transaction_id": "DIO63HEM3W",
    "transaction_date": "24-09-2026 12:16:23",
    "amount": 280,
    "currency": "ETB"
  },
  "data": {
    "currency": "ETB",
    "payer_name": "Henok Wondimu Beri",
    "payer_phone": "2519%%**3712",
    "payer_account_type": "Individual Customer",
    "credited_party_name": "Commercial Bank of Ethiopia",
    "credited_party_account_no": "0003",
    "transaction_status": "Completed",
    "bank_account_number": "1000342590431",
    "bank_account_holder_name": "Mr Sefanit Mengistu Belete",
    "invoice_no": "DIO63HEM3W",
    "payment_date": "24-09-2026 12:16:23",
    "settled_amount": 277,
    "stamp_duty": 0,
    "discount_amount": 0,
    "service_fee": 2.61,
    "service_fee_vat": 0.39,
    "total_paid_amount": 280,
    "total_amount_in_words": "two hundred eighty birr and zero cents",
    "payment_mode": "telebirr",
    "payment_reason": "Customer Transfer from Mobile Money",
    "customer_note": "Beniyas Henok",
    "confidence_notes": null
  },
  "ocr_confidence": 58,
  "raw_text": "..."
}
```

- `ocr_confidence` is Tesseract's own confidence score (0–100) for the OCR pass.
- `raw_text` is the unprocessed OCR output — useful for debugging misparses.
- Fields that couldn't be confidently determined come back as `null`, and
  `confidence_notes` flags when key fields (total, items) weren't found.

### `GET /health`

Simple liveness check, returns `{ "status": "ok" }`.

## Improving accuracy

If you find the parser missing fields on your real-world receipts:

1. Check `raw_text` in the response to see what Tesseract actually read.
2. If OCR itself is garbling text (blurry photos, low contrast), consider
   pre-processing images (grayscale, contrast boost, deskew) before passing
   them to `runOcr` — libraries like `sharp` work well for this.
3. If OCR text is clean but parsing misses fields, adjust the regex patterns
   in the relevant parser (`src/receiptParser.js` for retail receipts,
   `src/telebirrParser.js` for Telebirr receipts) to match your documents'
   specific wording/formatting.
4. For persistently tricky formats, consider a hybrid: keep this pipeline for
   most cases, and fall back to a vision-LLM call only when `confidence_notes`
   comes back non-null.

## Integrating into your app

Standalone API — call `POST /api/extract-receipt` from your existing backend
or frontend like any other REST endpoint. It doesn't persist images or
results; add your own storage step after the response if needed.
