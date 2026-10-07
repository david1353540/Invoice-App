"""Loopback-only Invoice Studio app and local Qwen vision extraction bridge."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, urllib.request, urllib.error, threading, base64, binascii, time
from invoice_pipeline import extract, health, LABEL
import invoice_pipeline
from invoice_grouping import group_invoices
from invoice_pages import extract_pages

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'outputs/invoice-studio'
LOCK = threading.Lock()

class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(STATIC),**kwargs)
 def log_message(self,*args): pass  # Never log document content.
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  self.send_header('X-Content-Type-Options','nosniff')
  super().end_headers()
 def reply(self,status,payload):
  body=json.dumps(payload).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers()
  try: self.wfile.write(body)
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError): pass
 def allowed(self):
  return self.headers.get('Host') in ('127.0.0.1:8765','localhost:8765') and self.headers.get('Origin') in (None,'http://127.0.0.1:8765','http://localhost:8765')
 def do_GET(self):
  if not self.allowed(): return self.reply(403,{'error':'Local access only.'})
  if self.path=='/api/health':
   try: return self.reply(200,health())
   except Exception: return self.reply(200,{'ready':False,'model':LABEL})
  return super().do_GET()
 def do_POST(self):
  if not self.allowed(): return self.reply(403,{'error':'Local access only.'})
  if self.path not in ('/api/extract','/api/group-invoices','/api/extract-pages'): return self.reply(404,{'error':'Unknown endpoint.'})
  if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.reply(415,{'error':'JSON required.'})
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<=25000000: return self.reply(413,{'error':'The invoice images are too large. Split the document into smaller files.'})
   body=json.loads(self.rfile.read(length)); images=body.get('images')
   if not isinstance(images,list) or not images: return self.reply(400,{'error':'Provide at least one invoice page image.'})
   for image in images:
    if not isinstance(image,str) or len(image)>10000000: raise ValueError('Invalid image')
    raw=base64.b64decode(image,validate=True)
    if not (raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff')): raise ValueError('Invalid image type')
  except (ValueError,AttributeError): return self.reply(400,{'error':'Invalid extraction request.'})
  if not LOCK.acquire(blocking=False): return self.reply(409,{'error':'The local AI is reading another invoice. Please retry when it finishes.'})
  try:
   if self.path=='/api/extract-pages': return self.reply(200,extract_pages(images,invoice_pipeline))
   if self.path=='/api/group-invoices':
    try: return self.reply(200,group_invoices(images,invoice_pipeline))
    except ValueError as error: return self.reply(422,{'error':str(error)})
   return self.reply(200,extract(images))
  except urllib.error.HTTPError: return self.reply(503,{'error':'The local AI could not process this invoice. It may still be starting; please retry shortly.'})
  except (urllib.error.URLError,TimeoutError): return self.reply(503,{'error':'One of the local AI models is unavailable or took too long. Start the E-drive model service and retry.'})
  except (ValueError,KeyError,IndexError,TypeError): return self.reply(502,{'error':'The local AI could not confirm valid invoice details after automatic rechecking. Please review the source image and try again; no invalid result has been accepted.'})
  finally: LOCK.release()

if __name__=='__main__':
 print('Invoice Studio: http://127.0.0.1:8765/',flush=True)
 ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
