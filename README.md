# Invoice Studio

A local invoice upload, preview and extraction app. NuExtract3 reads page images; Qwen3.5 9B turns the collected data into short supplier-first summaries. Invoice content is processed on your computer, not sent to a cloud AI service.

## Features

- Upload PNG/JPEG images, add and reorder pages, and preview the originals. Only JPG/JPEG and PNG files are accepted; export other document formats as images before uploading.
- Start extraction manually when all pages are ready.
- Extract supplier, invoice date, invoice number, currency, total, line items and commercial notes.
- Read **all images first**, one page at a time. Collect pages by supplier and invoice reference, then summarise each invoice separately.
- Keep line items expandable and show uncertain or missing information for review.
- Use local invoice-content checks before admission, with a confirmation option for rejected/unverified documents.
- Retry only defined validation errors; no routine separate AI summary review. Both models use thinking disabled.

## Requirements

- Windows with PowerShell (the included launch scripts target Windows).
- [Python 3.10 or newer](https://www.python.org/downloads/windows/), with the Python launcher or `python` on PATH. The server uses only the standard library: no pip packages are required to run the app.
- A current [Ollama installation](https://ollama.com/download/windows) on PATH, supporting both model tags below. See the [official Windows instructions](https://docs.ollama.com/windows).
- A modern browser. No frontend build or Node.js installation is required for normal use.
- Enough disk space and RAM/VRAM for both quantized models. Performance varies by hardware.

Model weights and Ollama are **not included in Git**. Bundled Tesseract assets are included so the browser does not need a CDN.

## Download and first-time setup

1. Download [this repository](https://github.com/david1353540/Invoice-App) as a ZIP and extract it, or run `git clone https://github.com/david1353540/Invoice-App.git`. Open PowerShell in the project folder containing `server.py`.
2. Install Python and Ollama. Open the Ollama desktop application; its API should be running at `http://127.0.0.1:11434`.
3. In a separate PowerShell window, start the extraction service:

   ```powershell
   .\Start-Extractor.ps1
   ```

   Leave that window open. It serves NuExtract3 on port **11435** and stores its weights under `outputs/local-ai/ollama-models` inside this project.

4. In your original PowerShell window, download the two required models:

   ```powershell
   .\Download-Models.ps1
   ```

   This pulls `numind/nuextract3:Q4_K_M` into the extraction service and `qwen3.5:9b` into the main Ollama service. If interrupted, run the script again. Qwen's storage location is controlled by the main Ollama service, not the download script. To choose a different storage location, configure `OLLAMA_MODELS` for the main Ollama application **before downloading**, then quit and reopen Ollama as described in the [official model-location instructions](https://docs.ollama.com/windows#changing-model-location).

5. Start the app:

   ```powershell
   .\Start-InvoiceStudio.ps1
   ```

6. Open **http://127.0.0.1:8765/**. Upload your pages and select **Extract invoice**.

If Windows blocks downloaded scripts, inspect them and unblock the files through Properties, or use `Unblock-File` on the scripts you downloaded. Follow your computer's PowerShell execution policy; a permanent unrestricted policy is not required.

## Subsequent runs

Open Ollama, then run `Start-InvoiceStudio.ps1`. The launcher starts the extraction service if needed and checks that both model tags exist. Downloads only need to be repeated if models are missing or you intentionally update them.

After updating Python source, run:

```powershell
.\Restart-InvoiceStudio.ps1
```

Refresh the browser afterward. Browser refresh clears uploaded files and session results. Logs are written to the ignored `work` directory. Set `INVOICE_PYTHON` to a Python executable path if you need to select a specific installation.

## How processing works

1. Local OCR/rules check whether the upload resembles an invoice. This is a content check, not an authenticity check; the user may confirm an uncertain/rejected document.
2. The browser prepares page images and sends them to the loopback Python server.
3. NuExtract3 reads each image independently, extracting the fields and line items in the same pass. Missing header fields or totals on continuation pages do not automatically cause retries.
4. The app groups the collected records by supplier and invoice number. It preserves line order, avoids adding repeated totals, and leaves conflicting scalar values blank with warnings. Uncertain identities are flagged for review rather than guessed silently.
5. Any necessary amount-recovery work completes for all groups before Qwen receives data. Qwen receives text only and creates a two-sentence category-based summary for each group.

The main app uses `/api/extract-pages`. Both models have thinking disabled. Qwen never receives invoice images. There is no separate AI summary-review pass; basic validation and bounded correction remain.

## Limits and troubleshooting

- Images have no fixed page-count cap, but files are limited to 20 MB each and requests to 25 MB of encoded image data. The batch processing deadline is about 820 seconds.
- PDF, Word and other non-image files are not accepted, including through drag-and-drop.
- Two invoices within one image require cropping into separate images. Missing invoice identities may produce separate results requiring review.
- English OCR is bundled. Poor scans, handwriting and unusual layouts can reduce accuracy.
- Model output can be wrong, particularly category wording and the distinction between current charges and future charges/exclusions. Check dates, totals, line items and notes against the originals. Missing information is not a reason to invent a value.
- If the app asks for a restart or reports an unknown endpoint, run the restart script. If a model is missing, run the download script after both services are available.
- Ports 8765, 11434 and 11435 must be available to the appropriate services. Do not expose the app publicly: it is a local development server, not an authenticated hosted service.

Uploads and session results are kept in browser memory. The app does not intentionally save invoice documents or extraction results to disk, and its server suppresses document-content access logging. Ollama has its own runtime/logging behavior. Internet access is needed for initial software/model downloads; inference uses local APIs.

## Project layout and tests

- `server.py`: loopback HTTP API and static files.
- `invoice_pages.py`: page-first extraction, merging and summary ordering.
- `invoice_pipeline.py`: model configuration, prompts, schema and local API calls.
- `invoice_checks.py`, `invoice_amounts.py`, `invoice_grouping.py`: validation, amount recovery and grouping.
- `outputs/invoice-studio/`: browser app and bundled dependencies.
- `tests/`: focused regression tests; no private invoice fixtures or model weights.

Run the Python checks with `py -3 -m unittest discover -s tests -p "test_*.py"`. The browser-flow test additionally requires Node.js: `node tests/test-multipage-ui.mjs`. See [THIRD_PARTY.md](THIRD_PARTY.md) for dependency notices. No application source licence has been selected yet; choose one before offering open-source reuse permissions.

## Technical choices made

Initially, I began with Muse Glimmer 30B to see the correct extractions and understand what to expect from the summary. However, extraction for a one-page invoice with one line item took approximately three minutes.

I then moved to Qwen3.5 9B. With slight prompt adjustments, it explained invoices to a similar extent as the 30B model and took approximately one minute. To go further, I tried Qwen3.5 4B. Time fell to roughly 30 seconds, but the drop in extraction and summary accuracy was too great.

Next, I tried two 4B models: NuExtract3 with thinking off for extraction, and Qwen3-4B-Thinking-2507 for summaries. Initial examples matched the 9B results in around 30 seconds. However, a random 20-invoice test produced 12 passes and eight failures, with inconsistent results, including invoice notes sometimes missing.

To investigate whether extraction or summarisation was responsible, I replaced the Qwen 4B model with Qwen3.5 9B while keeping NuExtract3. This provided 20 automatic passes on the same 20 test invoices, with all 210 line items matching and an average of 18.7 seconds per invoice. Summary wording still had limitations, so this did not establish perfect semantic accuracy or prove that every earlier failure came from the summary model.

Later experiments added separate page identification, automatic rereads and AI summary review. A subsequent 20-invoice run averaged 75.4 seconds. Synthetic/not-payable labels unnecessarily triggered rereads, and the AI review still missed unsupported wording. I removed routine summary review and limited retries to defined errors.

The current design reads all page images with NuExtract3 first, gathers records by supplier and invoice number, and only then sends each group to Qwen3.5 9B for a text-only summary. Thinking is off for both models.

The latest fresh test used 20 synthetic invoices with 1–20 line items each, 23 pages in total, and ten paired batches with interleaved pages. All invoice fields, all 210 line items and all page groupings matched. It took 297.1 seconds overall, or 14.86 seconds per invoice averaged across batches, with 23 NuExtract calls, 20 Qwen calls, no retries and no GPU timeouts. Manual review still found four material summary-wording issues; one automatic keyword failure was simply “sixty-day” versus “60-day”.

These timings are observations from different fixtures and workflows, not a controlled hardware benchmark. The final average measures batch throughput, not individual-upload latency. Clean synthetic tests do not establish accuracy on real-world scans.
