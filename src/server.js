// ============================================================================
// server.js — the entry point of the backend. Running `npm start` runs this
// file. It sets up an Express web server, wires up middleware (functions
// that process every request), defines our one real endpoint, and starts
// listening for requests.
// ============================================================================

// dotenv reads a local ".env" file (if present) and copies its key=value
// pairs into process.env, so the rest of our code can read them via
// process.env.SOMETHING. .config() is what actually triggers that reading —
// requiring the package alone does nothing.
require("dotenv").config();

// "path" is a built-in Node.js module (no install needed) for building
// filesystem paths correctly across operating systems — Windows uses
// backslashes, Mac/Linux use forward slashes, and path.join() handles
// that difference for us.
const path = require("path");

// Express is the web framework: it turns "listen on a port and respond to
// HTTP requests" into a much simpler API than doing it with raw Node.
const express = require("express");

// cors = Cross-Origin Resource Sharing. This middleware adds HTTP headers
// that tell browsers "it's fine for JavaScript running on a different
// website to call this API." We may not strictly need this once frontend
// and backend are served from the same origin, but it's harmless to keep
// and protects us if the frontend is ever hosted separately later.
const cors = require("cors");

// multer parses multipart/form-data request bodies — the format used when
// a browser uploads a file. Express does not understand file uploads on
// its own; multer is the standard middleware that adds that ability.
const multer = require("multer");

// Our own modules, each doing one job in the pipeline:
const { runOcr } = require("./ocrEngine");        // image -> raw text (Tesseract)
const { parseDocument } = require("./documentRouter"); // raw text -> structured fields, per document type
const { summarize } = require("./summarize");      // structured fields -> the 3 fields most callers want

// express() creates the actual application object. Everything below
// configures "app" before we finally call app.listen() at the bottom.
const app = express();

// Which network port to listen on. Hosting platforms (like Render) set
// process.env.PORT themselves to whatever port they expect your app to
// bind to — you don't get to choose it in production. The `|| 3000` is a
// fallback for when PORT isn't set, i.e. running locally on your machine.
const PORT = process.env.PORT || 3000;

// app.use() registers "middleware" — code that runs for every incoming
// request, in the order it's registered, before any specific route handler.
app.use(cors());

// express.static(folderPath) serves files directly out of that folder.
// For any incoming request Express doesn't have a specific route for
// (like our /api/extract-receipt route below), it checks this folder for
// a matching file. A request for "/" automatically resolves to
// "index.html" inside that folder if one exists — this is a built-in
// convention, not something we configured manually.
// __dirname is "the folder this file (server.js) lives in", i.e.
// .../receipt-extractor/src. We go up one level (via "..") to the project
// root, then into "public", landing on .../receipt-extractor/public —
// where our frontend's index.html lives.
app.use(express.static(path.join(__dirname, "..", "public")));

// Configure multer: memoryStorage() keeps the uploaded file as an
// in-memory Buffer (req.file.buffer) instead of writing it to disk. That's
// the right choice here since we only need the file briefly to run OCR on
// it, and never need to keep it around afterward.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // reject uploads over 10MB
});

// A minimal "is the server alive?" endpoint. Hosting platforms and
// monitoring tools commonly ping a /health route like this to check the
// app hasn't crashed — it does no real work, just confirms the server is
// responding.
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// This is the main endpoint the frontend calls.
// app.post(path, middleware, handler):
//   - path: the URL this responds to
//   - upload.single("image"): runs BEFORE our handler function, parses the
//     incoming multipart form data, and expects exactly one file field
//     named "image" — that name must match the field name the frontend's
//     FormData.append("image", file) call uses.
//   - the async (req, res) function: our actual logic, runs after multer
//     has already parsed the file and attached it as req.file.
app.post("/api/extract-receipt", upload.single("image"), async (req, res) => {
  // If no file was attached (field missing, or wrong field name), multer
  // won't error — req.file will just be undefined. We check for that
  // explicitly and respond with a clear 400 (client error) instead of
  // letting the code below crash on a missing file.
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided. Use form field name "image".' });
  }

  try {
    // Step 1: OCR. Turns the raw image bytes (req.file.buffer) into plain
    // text, plus Tesseract's own confidence score for how sure it is about
    // that reading.
    const { text, confidence } = await runOcr(req.file.buffer);

    // Step 2: Detect which kind of document this is (retail receipt vs.
    // Telebirr receipt, etc.) and parse its fields accordingly.
    const { document_type, data } = parseDocument(text);

    // Step 3: Reduce all those document-specific fields down to the 3
    // fields most callers actually want, in one consistent shape
    // regardless of document type.
    const summary = summarize(document_type, data);

    // Send everything back as JSON: the quick-access summary, the full
    // detailed fields, and the raw OCR text/confidence for debugging.
    res.json({
      success: true,
      document_type,
      summary,
      data,
      ocr_confidence: confidence,
      raw_text: text,
    });
  } catch (err) {
    // Anything that throws inside the try block (a corrupt image, an
    // unsupported file type, a parsing bug) lands here instead of
    // crashing the whole server. 422 means "the request was well-formed,
    // but we couldn't process its contents."
    console.error("Extraction error:", err.message);
    res.status(422).json({ success: false, error: err.message });
  }
});

// A special kind of middleware: one with FOUR parameters (err, req, res,
// next) instead of the usual three. Express specifically recognizes this
// signature as an error handler, and routes any error thrown or passed to
// next(err) anywhere above it into this function. This is where multer's
// own errors (like "file too large") end up, plus anything else
// unexpected we didn't already catch.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Finally, start the server: begin listening for incoming HTTP requests on
// PORT. The callback function runs once the server has successfully
// started, purely so we get a log line confirming it's up.
app.listen(PORT, () => {
  console.log(`Receipt extraction API listening on port ${PORT}`);
});
