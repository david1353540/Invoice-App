(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const files = [];
let selected = null;
let serial = 0;
const input = $('file-input');
const stage = $('preview-stage');
const initialPreview = stage.innerHTML;
const maxSize = 20 * 1024 * 1024;
let previewVersion = 0;
let checking = false;
let extractionQueue = Promise.resolve();
const sizeLabel = (bytes) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function renderList() {
  $('file-count').textContent = files.length;
  $('file-list').replaceChildren();
  if (!files.length) {
    const empty = document.createElement('div'); empty.className = 'files-empty'; empty.textContent = 'Your uploaded invoices will appear here.'; $('file-list').append(empty);
  }
  for (const file of files) {
    const row = document.createElement('div'); row.className = `file-row${file.id === selected ? ' active' : ''}`;
    const button = document.createElement('button'); button.className = 'file-select'; button.setAttribute('aria-pressed', String(file.id === selected));
    const badge = document.createElement('span'); badge.className = 'file-badge'; badge.textContent = file.kind;
    const info = document.createElement('span'); info.className = 'file-info';
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = file.name; name.title = file.name;
    const meta = document.createElement('span'); meta.className = 'file-meta'; meta.textContent = file.demo ? 'Sample document' : `${sizeLabel(file.size)} · ${file.pages ? file.pages.length + ' image page(s)' : 'Image invoice'}`;
    info.append(name, meta); button.append(badge, info); button.onclick = () => selectFile(file.id);
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${file.name}`); remove.onclick = () => removeFile(file.id);
    row.append(button, remove); $('file-list').append(row);
  }
}
function selectFile(id) {
  previewVersion++;
  selected = id; const file = files.find(item => item.id === id); renderList(); renderExtraction(file);
  stage.classList.remove('has-pdf'); stage.replaceChildren();
  $('open-file').hidden = true; $('open-file').removeAttribute('href'); $('file-type').hidden = !file;
  if (!file) { stage.innerHTML = initialPreview; $('choose-button').onclick = () => input.click(); $('preview-subtitle').textContent = 'No invoice selected'; $('preview-status').textContent = 'Ready when you are'; return; }
  $('preview-subtitle').textContent = file.name; $('file-type').textContent = file.kind;
  $('preview-status').textContent = file.demo ? 'Sample invoice · illustrative data' : `${sizeLabel(file.size)} · Stored in this tab only`;
  if (file.demo) { renderSample(); return; }
  $('open-file').href = file.url; $('open-file').hidden = false;
  renderImagePages(file);
}
function removeFile(id) {
  const index = files.findIndex(file => file.id === id); if (index < 0) return;
  const [removed] = files.splice(index, 1);
  if (selected === id) selectFile(files[Math.min(index, files.length - 1)]?.id ?? null); else renderList();
  for (const page of removed.pages || [removed]) if(page.url) URL.revokeObjectURL(page.url);
  $('feedback').textContent = '';
}
const busy = file => ['queued','loading'].includes(file?.ai?.status);
function updatePages(file) {
  file.size=file.pages.reduce((sum,p)=>sum+p.size,0);file.url=file.pages[0].url;
  file.pageCount=file.pages.length;file.pagesRead=file.pages.length;file.pageIndex=Math.min(file.pageIndex||0,file.pages.length-1);
  delete file.ai;
  delete file.invoiceConfirmed;
}
function renderImagePages(file) {
  const index=file.pageIndex||0;const page=file.pages[index];
  const viewer=document.createElement('div');viewer.className='image-pages';
  const toolbar=document.createElement('div');toolbar.className='pdf-controls';
  const action=(label,fn,disabled=false)=>{const b=document.createElement('button');b.type='button';b.className='button small secondary';b.textContent=label;b.disabled=disabled;b.onclick=fn;toolbar.append(b);return b;};
  action('Previous',()=>{file.pageIndex=index-1;selectFile(file.id);},index===0);
  const counter=document.createElement('span');counter.textContent=`Page ${index+1} of ${file.pages.length}`;counter.setAttribute('role','status');toolbar.append(counter);
  action('Next',()=>{file.pageIndex=index+1;selectFile(file.id);},index===file.pages.length-1);
  const locked=busy(file)||checking;
  action('Move earlier',()=>{[file.pages[index-1],file.pages[index]]=[file.pages[index],file.pages[index-1]];file.pageIndex=index-1;updatePages(file);selectFile(file.id);},locked||index===0);
  action('Move later',()=>{[file.pages[index+1],file.pages[index]]=[file.pages[index],file.pages[index+1]];file.pageIndex=index+1;updatePages(file);selectFile(file.id);},locked||index===file.pages.length-1);
  action('Remove page',()=>{if(file.pages.length===1){removeFile(file.id);return;}const [removed]=file.pages.splice(index,1);URL.revokeObjectURL(removed.url);updatePages(file);selectFile(file.id);},locked);
  action('Add pages',()=>{pageTarget=file;pageInput.click();},locked);
  const label=document.createElement('p');label.className='pdf-message';label.textContent=page.name;
  const image=document.createElement('img');image.className='preview-image';image.alt=`${file.name}, page ${index+1}`;image.src=page.url;
  viewer.append(toolbar,label,image);stage.append(viewer);
  $('open-file').href=page.url;
  $('preview-status').textContent=`Page ${index+1} of ${file.pages.length} · All pages included`;
}
const pageInput=document.createElement('input');pageInput.type='file';pageInput.accept='.png,.jpg,.jpeg';pageInput.multiple=true;pageInput.hidden=true;document.body.append(pageInput);
let pageTarget=null;
pageInput.onchange=()=>{const incoming=[...pageInput.files];pageInput.value='';const target=pageTarget;pageTarget=null;if(target&&files.includes(target))addFiles(incoming,target);};
function confirmInvoice(reason) {
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='invoice-confirm';
    dialog.setAttribute('aria-labelledby','invoice-confirm-title');dialog.setAttribute('aria-describedby','invoice-confirm-description');
    const title=document.createElement('h2');title.id='invoice-confirm-title';title.textContent='Are you sure this is an invoice?';
    const message=document.createElement('p');message.id='invoice-confirm-description';message.textContent=reason+' Choose Yes to keep it as an invoice, or No to cancel.';
    const actions=document.createElement('div');actions.className='confirm-actions';
    const no=document.createElement('button');no.type='button';no.className='button secondary';no.textContent='No';
    const yes=document.createElement('button');yes.type='button';yes.className='button primary';yes.textContent='Yes, this is an invoice';
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(value);};
    no.onclick=()=>finish(false);yes.onclick=()=>finish(true);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
    actions.append(no,yes);dialog.append(title,message,actions);document.body.append(dialog);dialog.showModal();no.focus();
  });
}
async function addFiles(incoming,target=null) {
  if(checking||!incoming.length||busy(target))return;
  checking=true;input.disabled=true;$('dropzone').setAttribute('aria-busy','true');
  if(selected)selectFile(selected);
  const prepared=[];let committed=false;
  try {
    const entries=[];
    for(const file of incoming){
      if(!file.size||file.size>maxSize)throw new Error(`${file.name}: choose a non-empty file under 20 MB.`);
      const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
      const png=[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      if(!png&&!jpg)throw new Error(`${file.name}: only JPG and PNG images are supported. Export document pages as images first.`);
      entries.push({file,kind:png?'PNG':'JPG'});
    }
    const existing=target?.pages||[];
    for(const {file,kind} of entries){
      if([...existing,...prepared].some(p=>p.name===file.name&&p.size===file.size&&p.modified===file.lastModified))throw new Error(`${file.name}: this page is already included.`);
      const {checkInvoice}=await import('./invoice-check.mjs');
      const verdict=await checkInvoice(file,kind,progress=>{$('feedback').textContent=`${file.name}: ${progress}`;});
      if(!verdict.pageCount || typeof verdict.text!=='string'){
        // Failed OCR can still be overridden if the image itself opens correctly.
        let bitmap;
        try {bitmap=await createImageBitmap(file);} catch {throw new Error(`${file.name}: this image could not be opened.`);} finally {bitmap?.close();}
        verdict.text='';verdict.pageCount=1;verdict.pagesRead=1;
      }
      const url=URL.createObjectURL(file);
      prepared.push({name:file.name,size:file.size,modified:file.lastModified,kind,url,source:file,text:verdict.text,checkReason:verdict.reason,checkAccepted:verdict.accepted,pageCount:verdict.pageCount,pagesRead:verdict.pagesRead});
    }
    const {classifyInvoice}=await import('./invoice-check.mjs');
    const combined=classifyInvoice([...existing,...prepared].map(p=>p.text).join('\n'));
    const otherDocument=prepared.find(p=>p.checkReason?.startsWith('This appears to be'));
    let confirmed=false;
    if(!combined.accepted||otherDocument){
      confirmed=await confirmInvoice(otherDocument?.checkReason||combined.reason);
      if(!confirmed){$('feedback').textContent=target ? 'No pages were added. Your existing invoice is unchanged.' : 'The document was not added.';return;}
    }
    if(target&&!files.includes(target))throw new Error('The invoice was removed. Please upload the pages again.');
    let invoice;
      invoice=target||{id:++serial,name:prepared[0].name,kind:'IMAGES',pages:[],pageIndex:0};
      invoice.pages.push(...prepared);updatePages(invoice);
    invoice.invoiceConfirmed=confirmed;
    if(!target)files.push(invoice);committed=true;selectFile(invoice.id);
    $('feedback').textContent=confirmed ? 'Added with your confirmation. Select Extract invoice when ready.' : 'Pages ready. Check their order, then select Extract invoice.';
  }catch(error){$('feedback').textContent=error.message||'These files could not be read.';}
  finally{
    if(!committed)for(const page of prepared)URL.revokeObjectURL(page.url);
    checking=false;input.disabled=false;$('dropzone').removeAttribute('aria-busy');
    if(selected)selectFile(selected);
  }
}
input.onchange = () => { const incoming = [...input.files]; input.value = ''; addFiles(incoming); };
$('choose-button').onclick = () => input.click();
let dragDepth = 0;
for (const type of ['dragenter','dragover','dragleave','drop']) window.addEventListener(type, event => event.preventDefault());
$('dropzone').addEventListener('dragenter', () => { dragDepth++; $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => { if (--dragDepth <= 0) $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', event => { dragDepth = 0; $('dropzone').classList.remove('dragging'); addFiles([...event.dataTransfer.files]); });
$('demo-button').onclick = () => {
  let demo = files.find(file => file.demo);
  if (!demo) { demo = {id:++serial,name:'Northline — INV-2026-042',kind:'DEMO',demo:true}; files.push(demo); }
  $('feedback').textContent = ''; selectFile(demo.id);
};
function renderSample() {
  stage.innerHTML = `<article class="sample-sheet" aria-label="Sample invoice"><div class="sample-top"><div class="sample-wordmark">northline<span style="color:#285de5">.</span><p>Independent design studio</p></div><div><div class="sample-label">SAMPLE DOCUMENT</div><span class="sample-pill">For demonstration only</span></div></div><h3>Invoice</h3><p>INV-2026-042</p><div class="sample-parties"><div><p>BILLED TO</p><strong>Acme Creative Ltd.</strong><p>14 Park Street<br>London, W1K 6RF</p></div><div><p>ISSUED</p><strong>30 September 2026</strong><p>DUE DATE</p><strong>30 October 2026</strong></div></div><table class="sample-table"><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td>Brand identity design</td><td>1</td><td>£1,200.00</td></tr><tr><td>Website design</td><td>1</td><td>£850.00</td></tr><tr><td>Design support</td><td>4</td><td>£300.00</td></tr></tbody></table><div class="sample-total"><span>Total due</span><span>£2,350.00</span></div><p class="sample-note">Thank you for working with Northline.<br>This is a fictional invoice for previewing the workspace.</p></article>`;
}

function renderExtraction(file) {
  const panel = $('extraction-content'); panel.replaceChildren();
  const button = $('extract-button'); button.hidden = !file || file.demo;
  button.disabled = checking || busy(file);
  button.textContent = file?.ai?.status === 'error' ? 'Retry extraction' : file?.ai ? 'Extract again' : 'Extract invoice';
  button.onclick = () => { if (file) extractInvoice(file,true); };
  const note = (text,cls='extraction-note') => { const p=document.createElement('p'); p.className=cls; p.textContent=text; panel.append(p); };
  if (!file || file.demo) { note(file?.demo ? 'Upload your own invoice to extract its details with NuExtract3 + Qwen3.5 9B.' : 'Upload your invoice pages, then select Extract invoice.'); return; }
  if(file.invoiceConfirmed)note('Invoice check overridden with your confirmation.');
  const ai=file.ai;
  if (!ai) { note('Check the page order, then select Extract invoice. Different invoices will be separated into their own results.'); return; }
  if(ai.status==='queued') { note('Waiting to process this invoice…'); return; }
  if (ai.status==='loading') { note(ai.message || 'Reading the invoice and creating its summary. An automatic recheck runs only if an error is found.'); return; }
  if (ai.status==='error') { note(ai.error,'extraction-error'); return; }
  const data=ai.data;
  if(ai.qualityCheck?.status==='needs_review') note('Please review: some details could not be confirmed after automatic rechecking.','extraction-warning');
  else if(ai.qualityCheck?.retried) note('Automatically rechecked after an issue was found.');
  const grid=document.createElement('dl'); grid.className='extraction-grid';
  const total = data.total_amount && data.currency && !data.total_amount.includes(data.currency) ? `${data.currency} ${data.total_amount}` : data.total_amount;
  for(const [label,value] of [['Supplier / vendor',data.supplier],['Invoice date',data.invoice_date],['Invoice number',data.invoice_number],['Total amount',total]]) {
    const field=document.createElement('div'); const dt=document.createElement('dt'); dt.textContent=label;
    const dd=document.createElement('dd'); dd.textContent=value ?? (label==='Total amount' ? '' : 'Not found'); field.append(dt,dd); grid.append(field);
  }
  panel.append(grid);
  const summary=document.createElement('p'); summary.className='invoice-summary'; summary.textContent=data.summary.length ? data.summary.join(' ') : 'Summary unavailable — please review the original invoice.'; panel.append(summary);
  const heading=document.createElement('h3'); heading.textContent='Line items'; panel.append(heading);
  if (!data.line_items.length) note('No line items could be read.');
  else {
    const wrap=document.createElement('div'); wrap.className='items-scroll'; const table=document.createElement('table'); table.className='items-table';
    const head=document.createElement('thead'); const row=document.createElement('tr');
    for(const title of ['Description','Quantity','Unit price','Amount']) {const th=document.createElement('th'); th.scope='col';th.textContent=title;row.append(th);} head.append(row);table.append(head);
    const body=document.createElement('tbody'); body.id='invoice-line-items';
    for(const item of data.line_items) {const tr=document.createElement('tr');for(const key of ['description','quantity','unit_price','amount']){const td=document.createElement('td');td.textContent=item[key] ?? (key==='amount'||key==='unit_price' ? '' : 'Not found');tr.append(td);}body.append(tr);}
    table.append(body);wrap.append(table);panel.append(wrap);
    if(data.line_items.length>1) {
      const remaining=data.line_items.length-1;
      const toggle=document.createElement('button'); toggle.type='button'; toggle.className='items-toggle';
      toggle.setAttribute('aria-controls',body.id);
      let expanded=false;
      const update=()=>{
        Array.from(body.children).forEach((row,index)=>{row.hidden=index>0&&!expanded;});
        toggle.setAttribute('aria-expanded',String(expanded));
        toggle.textContent=expanded ? 'Show fewer line items' : `${remaining} other line item${remaining===1?'':'s'}`;
      };
      toggle.addEventListener('click',()=>{expanded=!expanded;update();});
      update();panel.append(toggle);
    }
  }
  for(const calculation of data.calculated_amounts||[]) note(`${calculation.field==='total_amount'?'Total amount':'Line '+(Number(calculation.field.match(/\d+/)?.[0])+1)+' amount'} calculated: ${calculation.formula} = ${calculation.value}.`);
  for(const warning of data.warnings) note(warning,'extraction-warning');
  note('Read directly from invoice images · Check dates, references and amounts against the original.');
}
async function requestAI(path,images) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),860000);
  try {
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images}),signal:controller.signal});
    const result=await response.json();if(response.status===404&&path==='/api/extract-pages')throw new Error('Restart Invoice Studio to activate page-by-page extraction, then retry.');if(!response.ok)throw new Error(result.error||'The local AI could not process this upload.');return result;
  }finally {clearTimeout(timer);}
}
function extractionError(error) {return error.name==='AbortError' ? 'Processing took too long. Please retry.' : error.message==='Failed to fetch' ? 'Cannot reach the local AI. Start Invoice Studio and retry.' : error.message;}
function applyPageResults(file,result,images) {
  const results=result.invoices;
  if(!Array.isArray(results)||!results.length||result.page_count!==images.length)throw new Error('Invalid page results. Your upload has been kept.');
  const indexes=results.flatMap(r=>r.pages||[]);
  if(results.some(r=>!r.data||!Array.isArray(r.pages)||!r.pages.length)||indexes.length!==images.length||new Set(indexes).size!==images.length||indexes.some(i=>!Number.isInteger(i)||i<0||i>=images.length))throw new Error('Some page results are missing or repeated. Your upload has been kept.');
  if(results.length===1){file.ai={status:'done',data:results[0].data,qualityCheck:results[0].quality_check};return;}
  const children=results.map(result=>{
    const pages=result.pages.map(i=>{
      if(file.pages)return file.pages[i];
      const source=new Blob([Uint8Array.from(atob(images[i]),c=>c.charCodeAt(0))],{type:'image/png'});
      return {name:`${file.name} — page ${i+1}`,size:source.size,kind:'PNG',url:URL.createObjectURL(source),source,text:file.text||'',pageCount:1,pagesRead:1};
    });
    const child={id:++serial,name:pages[0].name,kind:'IMAGES',pages,pageIndex:0};
    updatePages(child);child.invoiceConfirmed=file.invoiceConfirmed;
    child.ai={status:'done',data:result.data,qualityCheck:result.quality_check};return child;
  });
  files.splice(files.indexOf(file),1,...children);
  if(!file.pages)URL.revokeObjectURL(file.url);
  if(selected===file.id)selectFile(children[0].id);else renderList();
  $('feedback').textContent=`All pages read. ${children.length} invoice results created with separate summaries.`;
}
function extractInvoice(file,retry=false) {
  if(checking||!files.includes(file)||file.demo||busy(file))return;
  if(file.ai&&!retry)return;
  file.ai={status:'queued'};if(selected===file.id)selectFile(file.id);
  extractionQueue=extractionQueue.then(async()=>{
    if(!files.includes(file))return;
    file.ai={status:'loading',message:'Preparing all pages for one extraction…'};if(selected===file.id)renderExtraction(file);
    try {
      const {prepareImages}=await import('./vision-input.mjs');let images=[];
      if(file.pages){
        const {classifyInvoice}=await import('./invoice-check.mjs');const verdict=classifyInvoice(file.pages.map(p=>p.text).join('\n'));
        if(!verdict.accepted&&!file.invoiceConfirmed){if(!await confirmInvoice(verdict.reason))throw new Error('Extraction cancelled.');file.invoiceConfirmed=true;}
        for(const page of file.pages)images.push(...await prepareImages(page.source,page.kind));
      }else images=await prepareImages(file.source,file.kind);
      if(!files.includes(file))return;
      file.ai={status:'loading'};if(selected===file.id)renderExtraction(file);
      const result=await requestAI('/api/extract-pages',images);
      if(!files.includes(file))return;
      applyPageResults(file,result,images);
      if(selected===file.id&&files.includes(file))selectFile(file.id);
    }catch(error){file.ai={status:'error',error:extractionError(error)};if(selected===file.id&&files.includes(file))selectFile(file.id);}
  });
}

})();
