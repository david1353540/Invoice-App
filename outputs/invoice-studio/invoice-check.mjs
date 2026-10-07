// Conservative English invoice rules. This is a content check, not an authenticity check.
export function classifyInvoice(rawText) {
  const text = rawText.normalize('NFKC').replace(/\r/g, '').replace(/[\t ]+/g, ' ').trim();
  if (text.replace(/\s/g, '').length < 45) return {accepted:false, reason:'Not enough readable text to verify an invoice. Try a clearer copy.'};
  const header = text.slice(0, 800);
  const otherDocument = /(?:^|\n)\s*(?:(?:sales|payment|purchase|order)\s+)?(?:quotation|quote|estimate|receipt|purchase order|credit note|delivery note|statement(?: of account)?)\b[^\n]{0,60}(?:\n|$)/i.test(header);
  if (otherDocument || /\bpro[ -]?forma\s+invoice\b/i.test(header)) return {accepted:false, reason:'This appears to be a quote, receipt, statement or another document type, rather than an invoice.'};
  const invoice = /(?:^|\n)\s*(?:(?:tax|sales|commercial|vat)\s+)?invoice\b/i.test(header) || /\binvoice\s*(?:number|no\.?|#|date)\s*[:#]?\s*\S+/i.test(header);
  const reference = /\binvoice\s*(?:(?:number|no\.?|ref(?:erence)?|#)\s*[:#]?\s*|[:#]\s*)[a-z0-9][a-z0-9/-]*/i.test(text) || /\bINV[\s/-]*\d[\w/-]*/i.test(text);
  const date = /\b\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/i.test(text);
  const amount = /(?:[£$€]\s*\d[\d,.]*|\b(?:GBP|USD|EUR|AUD|CAD)\s*\d[\d,.]*|\b\d[\d,.]*[.,]\d{2}\b)/i.test(text);
  const total = /\b(?:total(?:\s+(?:due|amount|payable|incl\.?))?|amount\s+(?:due|payable)|balance\s+due|grand\s+total)\b\s*[:\s]*(?:(?:GBP|USD|EUR|AUD|CAD)\s*)?[£$€]?\s*\d[\d,.]*/i.test(text);
  const party = /\b(?:bill(?:ed)?\s+to|invoice\s+to|customer|client|supplier|sold\s+to|vat\s*(?:no|number|registration)|company\s*(?:no|number))\b/i.test(text);
  const items = /\b(?:description|quantity|qty|unit\s+price|item|rate|services?|products?)\b/i.test(text);
  const supporting = [reference,date,party,items].filter(Boolean).length;
  if (invoice && amount && total && supporting >= 3) return {accepted:true, reason:'Passed invoice checks'};
  return {accepted:false, reason:'Could not verify an invoice. It needs invoice wording, a total and supporting details such as a reference, date, customer and line items.'};
}

export async function checkInvoice(file, kind, onProgress = () => {}) {
  if (!["PNG","JPG"].includes(kind)) return {accepted:false,reason:"Only JPG and PNG images are supported."};
  let ocrWorker;
  let timer;
  let expired = false;
  const cleanup = async () => { await Promise.allSettled([ocrWorker?.terminate()]); };
  async function recognise(image) {
    onProgress('Reading image text locally…');
    if (!ocrWorker) {
      const {default: {createWorker}} = await import('./vendor/ocr/tesseract.esm.min.js');
      if (expired) throw new Error('timeout');
      const worker = await createWorker('eng',1,{
        workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,
        corePath:new URL('./vendor/ocr/core/',import.meta.url).href,
        langPath:new URL('./vendor/ocr/lang',import.meta.url).href,
        gzip:false,cacheMethod:'none',workerBlobURL:false
      });
      ocrWorker = worker;
      if (expired) { await worker.terminate(); throw new Error('timeout'); }
    }
    return (await ocrWorker.recognize(image)).data.text;
  }
  async function inspect() {
    {
      const bitmap = await createImageBitmap(file);
      try {
        // Small screenshots need larger glyphs for OCR. Cap enlargement and
        // total dimensions so large images do not create excessive canvases.
        const scale = Math.min(3, 2400 / Math.max(bitmap.width,bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(bitmap.width*scale); canvas.height = Math.ceil(bitmap.height*scale);
        const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const text = await recognise(canvas);
        return {...classifyInvoice(text),text,ocr:true,pagesRead:1,pageCount:1};
      } finally { bitmap.close(); }
    }
  }
  try {
    return await Promise.race([inspect(), new Promise((_,reject) => {timer=setTimeout(()=>{expired=true;reject(new Error('timeout'));},90000);})]);
  } catch(error) {
    return {accepted:false,reason:expired ? 'The check took too long. Try a smaller or clearer document.' : 'The document could not be read for invoice checking. Try a clearer image.'};
  } finally { clearTimeout(timer); await cleanup(); }
}
