import sys,copy,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import invoice_pipeline as p
from invoice_checks import category_sentence,summary_issues
D={'supplier':'Example Ltd','invoice_date':'05/10/2026','invoice_number':'INV1','currency':'GBP','total_amount':'120.00','line_items':[{'description':'Hedge trimming','quantity':'1','unit_price':'100.00','amount':'100.00'}],'invoice_notes':['GBP 1200 is held back and will be invoiced only after the customer confirms satisfaction.'],'warnings':[]}
S={'categories':['Garden maintenance'],'supplier_sentence':'Example Ltd has charged for garden maintenance.','terms_sentence':'GBP 1200 is held back and will be invoiced only after the customer confirms satisfaction.'}
class Checks(unittest.TestCase):
 def run_case(self,outputs):
  with patch.object(p,'chat',side_effect=copy.deepcopy(outputs)) as chat:
   result=p.extract(['image'])
   return result,chat.call_count
 def test_summary_uses_category_not_model_product_list(self):
  candidate={**S,'supplier_sentence':'Example Ltd has charged for hedge trimming and weed removal.'}
  r,n=self.run_case([D,candidate,{'issues':[]}]);self.assertEqual(r['data']['summary'][0],'Example Ltd has charged for Garden maintenance.')
 def test_category_lists_and_vague_labels_rejected(self):
  source={'supplier':D['supplier'],'descriptions':['Hedge trimming'],'invoice_notes':D['invoice_notes']}
  for cats in [['products'],['wash, dry, press'],['Garden maintenance','Garden maintenance']]:
   self.assertTrue(summary_issues({**S,'categories':cats},source))
 def test_unrelated_classes_retained(self):
  s=category_sentence({**S,'categories':['appliances','legal services']},{'supplier':'Example Ltd'})
  self.assertEqual(s['supplier_sentence'],'Example Ltd has charged for appliances and legal services.')
 def test_valid_multiple_categories_do_not_trigger_recheck(self):
  candidate={**S,'categories':['Garden maintenance','Waste removal']}
  r,n=self.run_case([D,candidate]);self.assertEqual(n,2);self.assertEqual(r['categories'],candidate['categories']);self.assertFalse(r['quality_check']['retried'])
 def test_informational_warnings_do_not_trigger_recheck(self):
  d={**D,'warnings':['Synthetic test document','Generated test invoice - not payable','Payment due in 30 days']}
  r,n=self.run_case([d,S]);self.assertEqual(n,2);self.assertEqual(r['data']['warnings'],d['warnings']);self.assertFalse(r['quality_check']['retried'])
 def test_unreadable_amount_stays_empty_after_reread(self):
  bad={**copy.deepcopy(D),'total_amount':'unclear amount'}
  evidence={'safe_line_indices':[],'use_line_sum':False,'total_basis_complete':False,'tax_basis':'unknown','parts':[],'explanation':'Insufficient figures'}
  r,n=self.run_case([bad,bad,evidence,S,{'issues':[]}]);self.assertIsNone(r['data']['total_amount']);self.assertEqual(r['data']['supplier'],D['supplier'])
 def test_customer_instructions_are_summary_content(self):
  notes=['Instructions: report damage within 24 hours; late reporting may delay a credit note.']
  source={'supplier':'Example Ltd','descriptions':['Hedge trimming'],'invoice_notes':notes}
  summary={**S,'terms_sentence':'Report damage within 24 hours, as late reporting may delay a credit note.'}
  self.assertEqual(summary_issues(summary,source),[])
 def test_unknown_total_uses_neutral_wording(self):
  s=category_sentence(S,{'supplier':'Example Ltd','amount_confirmed':False});self.assertEqual(s['supplier_sentence'],'Example Ltd lists Garden maintenance.')
 def test_valid_review(self):
  r,n=self.run_case([D,S]);self.assertEqual(n,2);self.assertEqual(r['quality_check']['status'],'checked');self.assertFalse(r['quality_check']['retried'])
 def test_invalid_amount_repaired_from_images(self):
  bad=copy.deepcopy(D);bad['total_amount']='{"total":120}'
  r,n=self.run_case([bad,D,S]);self.assertEqual(n,3);self.assertEqual(r['data']['total_amount'],'120.00');self.assertTrue(r['quality_check']['retried'])
 def test_holdback_is_not_deposit(self):
  bad={**S,'terms_sentence':'A deposit of GBP 1200 is held back pending confirmation.'}
  r,n=self.run_case([D,bad,S]);self.assertEqual(n,3);self.assertEqual(r['data']['summary'][1],S['terms_sentence'])
 def test_inferred_total_relationship_repaired(self):
  bad={**S,'terms_sentence':'GBP 1200 is held back from the total amount until confirmation.'}
  r,n=self.run_case([D,bad,S]);self.assertEqual(n,3);self.assertEqual(r['data']['summary'][1],S['terms_sentence'])
 def test_defined_error_repaired_without_ai_review(self):
  bad={**S,'categories':['products']}
  r,n=self.run_case([D,bad,S]);self.assertEqual(n,3);self.assertTrue(r['quality_check']['retried'])
 def test_persistent_summary_error_withheld(self):
  bad={**S,'categories':['products']}
  r,n=self.run_case([D,bad,bad]);self.assertEqual(n,3);self.assertEqual(r['data']['summary'],[]);self.assertEqual(r['quality_check']['status'],'needs_review')
 def test_invalid_extraction_stops_after_two(self):
  with patch.object(p,'chat',side_effect=[{},{}]) as chat:
   with self.assertRaises(ValueError):p.extract(['image'])
   self.assertEqual(chat.call_count,2)
 def test_absent_field_not_invented(self):
  missing={**D,'invoice_date':None}
  r,n=self.run_case([missing,missing,S,{'issues':[]}]);self.assertEqual(r['quality_check']['status'],'needs_review');self.assertIsNone(r['data']['invoice_date'])
 def test_repaired_multiple_categories_have_no_review_call(self):
  bad={**S,'categories':['products']}
  repaired={**S,'categories':['Garden maintenance','Waste removal']}
  r,n=self.run_case([D,bad,repaired,{'categories':repaired['categories']}]);self.assertEqual(n,4);self.assertEqual(r['categories'],repaired['categories']);self.assertEqual(len(r['data']['summary']),2)
 def test_summary_timeout_keeps_fields_withholds_summary(self):
  with patch.object(p,'chat',side_effect=[copy.deepcopy(D),TimeoutError()]) as chat:
   r=p.extract(['image'])
  self.assertEqual(chat.call_count,2);self.assertEqual(r['data']['total_amount'],'120.00');self.assertEqual(r['data']['summary'],[]);self.assertEqual(r['quality_check']['status'],'needs_review')
 def test_transport_failure_not_retried_as_content(self):
  with patch.object(p,'chat',side_effect=TimeoutError) as chat:
   with self.assertRaises(TimeoutError):p.extract(['image'])
   self.assertEqual(chat.call_count,1)
if __name__=='__main__':unittest.main()
