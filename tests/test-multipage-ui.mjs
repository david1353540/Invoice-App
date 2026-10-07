import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {classifyInvoice} from '../outputs/invoice-studio/invoice-check.mjs';
const decisions=[];const prompts=[];
class Element {
 constructor(){this.children=[];this.attrs={};this.classList={add(){},remove(){}};this.innerHTML='';this.files=[];}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children}
 setAttribute(k,v){this.attrs[k]=v} removeAttribute(k){delete this.attrs[k]}
 addEventListener(type,fn){this.attrs[type]=fn} click(){this.onclick?.()}
 focus(){} close(){} remove(){}
 showModal(){prompts.push(this);queueMicrotask(()=>{const answer=decisions.shift()??false;if(answer==='cancel')this.attrs.cancel({preventDefault(){}});else this.children.at(-1).children[answer?1:0].onclick();});}
}
const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
const requests=[];let urls=0;let groupingPlan=null;let failNext=false;
const context={document:{getElementById:el,createElement:()=>new Element(),body:new Element()},window:{addEventListener(){}},URL:{createObjectURL:()=>`blob:${++urls}`,revokeObjectURL(){}},Uint8Array,Promise,AbortController,setTimeout,clearTimeout,console,
 testChecks:{classifyInvoice,checkInvoice:async file=>file.verdict||({accepted:false,text:file.text,pageCount:1,pagesRead:1,reason:'Could not verify an invoice.'})},testVision:{prepareImages:async file=>[file.name]},
 fetch:async(url,options)=>{const payload=JSON.parse(options.body);assert.equal(url,'/api/extract-pages','Only extraction may be requested; no grouping calls');requests.push(payload);if(failNext){failNext=false;return {ok:false,json:async()=>({error:'One invoice failed'})};}const data={supplier:'Test Ltd',invoice_date:'01/10/2026',invoice_number:'INV-1',currency:'GBP',total_amount:'100.00',summary:['Test Ltd has charged for supplies.','No extra terms.'],line_items:[],warnings:[]};return {ok:true,json:async()=>({page_count:payload.images.length,invoices:(groupingPlan||[payload.images.map((_,i)=>i)]).map(pages=>({pages,data,quality_check:{status:'checked'}}))})}}};
let source=fs.readFileSync(new URL('../outputs/invoice-studio/app.js',import.meta.url),'utf8').replaceAll("await import('./invoice-check.mjs')",'globalThis.testChecks').replaceAll("await import('./vision-input.mjs')",'globalThis.testVision');
source=source.replace(/\}\)\(\);\s*$/,'globalThis.appTest={files,addFiles,selectFile,extractInvoice,updatePages,getQueue:()=>extractionQueue};})();');
vm.runInNewContext(source,context);const app=context.appTest;
// Reject non-image bytes before OCR or the invoice-confirmation override.
for(const name of ['invoice.pdf','renamed.png','document.docx']) {
 const notImage={name,size:100,lastModified:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([37,80,68,70,45,49,46,55]).buffer})};
 const before=prompts.length;await app.addFiles([notImage]);assert.equal(app.files.length,0);assert.equal(requests.length,0);assert.equal(prompts.length,before);assert.match(el('feedback').textContent,/only JPG and PNG/);
}
const page=(name,text)=>({name,text,size:100,lastModified:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([137,80,78,71,13,10,26,10]).buffer})});
const first=page('page1.png','SALES INVOICE\nInvoice number: INV-1\nInvoice date: 01/10/2026\nBill to: Customer Ltd\nDescription Quantity Unit price\nOffice supplies 1 100.00');
const second=page('page2.png','Continued line items\nTotal GBP 100.00\nPayment due within thirty days.');
assert.equal(classifyInvoice(first.text).accepted,false);
await app.addFiles([first,second]);assert.equal(app.files.length,1);assert.equal(app.files[0].pages.length,2);assert.equal(requests.length,0);assert.equal(el('extract-button').textContent,'Extract invoice');
const invoice=app.files[0];app.selectFile(invoice.id);assert.equal(requests.length,0);
app.extractInvoice(invoice,true);await app.getQueue();assert.deepEqual(requests[0].images,['page1.png','page2.png']);assert.equal(invoice.ai.status,'done');
await app.addFiles([page('page3.png','Additional invoice terms with readable text.')],invoice);assert.equal(invoice.pages.length,3);assert.equal(invoice.ai,undefined);assert.equal(requests.length,1);
// UI page-order action changes both preview and the extraction payload.
invoice.pageIndex=2;app.selectFile(invoice.id);
const viewer=el('preview-stage').children[0];const earlier=viewer.children[0].children.find(b=>b.textContent==='Move earlier');earlier.onclick();
assert.equal(invoice.pages[1].name,'page3.png');app.extractInvoice(invoice,true);await app.getQueue();assert.deepEqual(requests[1].images,['page1.png','page3.png','page2.png']);
await app.addFiles([first],invoice);assert.equal(invoice.pages.length,3);assert.match(el('feedback').textContent,/already included/);
await app.addFiles([page('4.png','Continuation text'),page('5.png','Continuation text'),page('6.png','Continuation text'),page('7.png','Continuation text'),page('8.png','Continuation text')],invoice);assert.equal(invoice.pages.length,8);assert.equal(requests.length,2);app.extractInvoice(invoice,true);await app.getQueue();assert.deepEqual(requests[2].images,['page1.png','page3.png','page2.png','4.png','5.png','6.png','7.png','8.png']);
app.selectFile(invoice.id);const controls=el('preview-stage').children[0].children[0];controls.children.find(b=>b.textContent==='Remove page').onclick();assert.equal(invoice.pages.length,7);assert.equal(invoice.ai,undefined);assert.equal(requests.length,3);
const rejected=page('not-invoice.png','This is readable text but it is not an invoice with any supporting financial details.');
const originalCount=app.files.length;
decisions.push(false);await app.addFiles([rejected]);assert.equal(app.files.length,originalCount);assert.equal(requests.length,3);
decisions.push(true);await app.addFiles([rejected]);const overridden=app.files.at(-1);assert.equal(overridden.invoiceConfirmed,true);assert.equal(requests.length,3);const promptCount=prompts.length;app.extractInvoice(overridden,true);await app.getQueue();assert.equal(requests.length,4);assert.equal(prompts.length,promptCount);
const quote=page('quote.png','QUOTATION\nCustomer: Example\nTotal GBP 100.00');quote.verdict={accepted:false,text:quote.text,pageCount:1,pagesRead:1,reason:'This appears to be a quote, receipt, statement or another document type, rather than an invoice.'};
decisions.push(false);const oldPages=invoice.pages.length;await app.addFiles([quote],invoice);assert.equal(invoice.pages.length,oldPages);
decisions.push(true);await app.addFiles([quote],invoice);assert.equal(invoice.pages.length,oldPages+1);assert.equal(invoice.invoiceConfirmed,true);
decisions.push('cancel');const count=app.files.length;await app.addFiles([page('cancel.png',rejected.text)]);assert.equal(app.files.length,count);
const corrupt=page('corrupt.png','');corrupt.verdict={accepted:false,reason:'Cannot read image'};context.createImageBitmap=async()=>{throw Error('bad image')};const before=prompts.length;await app.addFiles([corrupt]);assert.equal(prompts.length,before);assert.equal(app.files.length,count);
context.createImageBitmap=async()=>({close(){}});decisions.push(true);await app.addFiles([corrupt]);assert.equal(app.files.at(-1).invoiceConfirmed,true);
console.log('PASS: manual extraction and multipage ordering; rejection No/cancel adds nothing; Yes persists through extraction; explicit quote rejection overridden; append rejection preserves existing pages; OCR-only failure can be overridden; corrupt image blocked.');

await app.addFiles([page('a1.png',first.text),page('b1.png',second.text),page('a2.png',second.text)]);
const combined=app.files.at(-1);const countBefore=app.files.length;const requestsBefore=requests.length;
app.extractInvoice(combined,true);await app.getQueue();
assert.equal(app.files.length,countBefore);assert.equal(app.files.at(-1),combined);
assert.equal(combined.ai.status,'done');assert.equal(requests.length,requestsBefore+1);
assert.deepEqual(requests.at(-1).images,['a1.png','b1.png','a2.png']);
failNext=true;app.extractInvoice(combined,true);await app.getQueue();
assert.equal(combined.ai.status,'error');assert.equal(app.files.length,countBefore);
assert.equal(combined.pages.map(p=>p.name).join(','),'a1.png,b1.png,a2.png');
app.extractInvoice(combined,true);await app.getQueue();assert.equal(combined.ai.status,'done');
assert.deepEqual(requests.at(-1).images,['a1.png','b1.png','a2.png']);
console.log('PASS: one combined upload, one extraction request with all pages in order, no grouping requests, failed extraction retains every page for retry.');

groupingPlan=[[0,2],[1]];
await app.addFiles([page('vendor-a.png',first.text),page('vendor-b.png',second.text),page('vendor-a-cont.png',second.text)]);
const batch=app.files.at(-1),beforeBatch=app.files.length,beforeRequests=requests.length;
app.extractInvoice(batch,true);await app.getQueue();
assert.equal(requests.length,beforeRequests+1);assert.equal(app.files.length,beforeBatch+1);
const children=app.files.slice(-2);assert.equal(children[0].name,'vendor-a.png');assert.equal(children[1].name,'vendor-b.png');
assert.equal(children[0].pages.map(p=>p.name).join(','),'vendor-a.png,vendor-a-cont.png');assert.equal(children[0].ai.status,'done');assert.equal(children[1].ai.status,'done');
groupingPlan=[[0,0],[1]];
await app.addFiles([page('invalid-a.png',first.text),page('invalid-b.png',second.text)]);
const invalid=app.files.at(-1),beforeInvalid=app.files.length;app.extractInvoice(invalid,true);await app.getQueue();
assert.equal(invalid.ai.status,'error');assert.equal(app.files.length,beforeInvalid);assert.equal(invalid.pages.length,2);
console.log('PASS: one batch request creates separate completed results with correct source pages; invalid page coverage preserves the original upload.');
