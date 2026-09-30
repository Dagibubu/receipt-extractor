// Maps each document type's own fields down to one common shape, since
// what most integrations actually need is just the transaction ID, date,
// and amount — regardless of which kind of receipt produced them.

function summarize(documentType, data) {
  switch (documentType) {
    case "mobile_wallet_receipt":
      return {
        transaction_id: data.transaction_number,
        transaction_date: data.transaction_time,
        amount: data.amount,
        currency: data.currency,
      };
    case "telebirr_receipt":
      return {
        transaction_id: data.invoice_no,
        transaction_date: data.payment_date,
        amount: data.total_paid_amount ?? data.settled_amount,
        currency: data.currency,
      };
    case "retail_receipt":
      return {
        transaction_id: data.transaction_id,
        transaction_date: data.date && data.time ? `${data.date} ${data.time}` : data.date,
        amount: data.total,
        currency: data.currency,
      };
    default:
      return {
        transaction_id: null,
        transaction_date: null,
        amount: null,
        currency: null,
      };
  }
}

module.exports = { summarize };
