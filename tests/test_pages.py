import sys,copy,json,unittest
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import invoice_pipeline as p
from invoice_pages import extract_pages
D={'supplier':'A Ltd','invoice_date':'07/10/2026','invoice_number':'A1','currency':'GBP','total_amount':'12.00','line_items':[{'description':'Paper','quantity':'1','unit_price':'10.00','amount':'10.00'}],'invoice_notes':[],'warnings':[]}
def page(**changes):return {'invoice':{**copy.deepcopy(D),**changes},'continuation':False,'multiple_invoices':False}
S={'categories':['Office supplies'],'supplier_sentence':'Supplier has charged for office supplies.','terms_sentence':'No additional commercial terms were identified.'}
class Tests(unittest.TestCase):
 def run_pages(self,values):
  calls=[];remaining=copy.deepcopy(values)
  def chat(payload,timeout,audit=None):
   calls.append(payload)
   if payload['model']==p.EXTRACTOR:return remaining.pop(0)
   self.assertFalse(remaining,'Qwen started before all images finished')
   self.assertFalse(any(m.get('images') for m in payload['messages']))
   return copy.deepcopy(S)
  with patch.object(p,'chat',side_effect=chat):r=extract_pages(['a','b','c'][:len(values)],p)
  self.assertTrue(all(c['think'] is False for c in calls))
  return r,calls
 def test_interleaved_pages_read_once_before_summaries(self):
  r,c=self.run_pages([page(),page(supplier='B Ltd',invoice_number='B1'),page()])
  self.assertEqual([x['pages'] for x in r['invoices']],[[0,2],[1]])
  self.assertEqual([x['model'] for x in c],[p.EXTRACTOR]*3+[p.SUMMARISER]*2)
  self.assertEqual(len(r['invoices'][0]['data']['line_items']),2)
  self.assertEqual(r['invoices'][0]['data']['total_amount'],'12.00')
 def test_same_supplier_different_invoice(self):
  r,c=self.run_pages([page(),page(invoice_number='A2')]);self.assertEqual(len(r['invoices']),2)
 def test_final_page_total_fills_missing_without_reread(self):
  r,c=self.run_pages([page(total_amount=None),page()]);self.assertEqual(len(c),3);self.assertEqual(r['invoices'][0]['data']['total_amount'],'12.00')
 def test_conflicting_totals_blank_not_summed(self):
  r,c=self.run_pages([page(),page(total_amount='24.00')]);self.assertIsNone(r['invoices'][0]['data']['total_amount']);self.assertEqual(len(c),3);self.assertEqual(r['invoices'][0]['quality_check']['status'],'needs_review')
 def test_unknown_page_kept_separate_for_review(self):
  r,c=self.run_pages([page(),page(supplier=None,invoice_number=None)]);self.assertEqual(len(r['invoices']),2);self.assertEqual(r['invoices'][1]['quality_check']['status'],'needs_review')
 def test_invalid_page_never_reaches_qwen(self):
  with patch.object(p,'chat',side_effect=[{},{}]) as chat:
   with self.assertRaises(ValueError):extract_pages(['a'],p)
   self.assertTrue(all(c.args[0]['model']==p.EXTRACTOR for c in chat.call_args_list))
 def test_all_amount_repairs_finish_before_any_summary(self):
  evidence={'safe_line_indices':[],'use_line_sum':False,'total_basis_complete':False,'tax_basis':'unknown','parts':[],'explanation':'Insufficient information'}
  with patch.object(p,'chat',side_effect=[page(total_amount=None),page(supplier='B Ltd',invoice_number='B1',total_amount=None),evidence,evidence,copy.deepcopy(S),copy.deepcopy(S)]) as chat:
   result=extract_pages(['a','b'],p)
  self.assertEqual([c.args[0]['model'] for c in chat.call_args_list],[p.EXTRACTOR]*4+[p.SUMMARISER]*2)
  self.assertTrue(all(x['data']['total_amount'] is None for x in result['invoices']))
if __name__=='__main__':unittest.main()
