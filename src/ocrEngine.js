const { createWorker } = require("tesseract.js");

/**
 * Runs OCR on an image buffer and returns raw recognized text.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ text: string, confidence: number }>}
 */
async function runOcr(imageBuffer) {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text, confidence },
    } = await worker.recognize(imageBuffer);
    return { text, confidence };
  } finally {
    await worker.terminate();
  }
}

module.exports = { runOcr };
