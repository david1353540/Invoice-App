import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from invoice_amounts import apply_evidence,number,recover
D={'total_amount':None,'line_items':[{'quantity':'3','unit_price':'2.50','amount':None}]}
def evidence(**kw):return {'safe_line_indices':[0],'use_line_sum':True,'total_basis_complete':True,'tax_basis':'explicit_amounts','parts':[{'kind':'tax','amount':'1.50','evidence':'VAT amount 1.50'}],**kw}
class AmountTests(unittest.TestCase):
 def test_recovery_images_only_sent_to_extractor(self):
  calls=[]
  def call(payload,timeout):calls.append(payload);return evidence()
  d=copy.deepcopy(D);d['warnings']=[]
  recover(d,['image-a'],call,{'EXTRACTOR':'extractor','SUMMARISER':'text-only'})
  self.assertEqual(calls[0]['model'],'extractor');self.assertFalse(calls[0]['think'])
  self.assertEqual(calls[0]['messages'][0]['role'],'template')
  self.assertEqual(calls[0]['messages'][-1]['images'],['image-a'])
 def test_line_and_total(self):
  d=copy.deepcopy(D);r=apply_evidence(d,evidence());self.assertEqual(d['line_items'][0]['amount'],'7.50');self.assertEqual(d['total_amount'],'9.00');self.assertEqual(len(r),2)
 def test_retail_pack_ambiguity(self):
  d=copy.deepcopy(D);apply_evidence(d,evidence(safe_line_indices=[],total_basis_complete=False));self.assertIsNone(d['total_amount']);self.assertIsNone(d['line_items'][0]['amount'])
 def test_unknown_tax(self):
  d=copy.deepcopy(D);apply_evidence(d,evidence(tax_basis='unknown'));self.assertEqual(d['line_items'][0]['amount'],'7.50');self.assertIsNone(d['total_amount'])
 def test_inclusive_tax_not_added_twice(self):
  d=copy.deepcopy(D);apply_evidence(d,evidence(tax_basis='included'));self.assertIsNone(d['total_amount'])
 def test_printed_values_preserved(self):
  d={'total_amount':'12.00','line_items':[{'quantity':'3','unit_price':'2.50','amount':'8.00'}]};apply_evidence(d,evidence());self.assertEqual(d['total_amount'],'12.00');self.assertEqual(d['line_items'][0]['amount'],'8.00')
 def test_subtotal_tax_charge_discount(self):
  d=copy.deepcopy(D);parts=[{'kind':k,'amount':v,'evidence':k+' '+v} for k,v in [('subtotal','100'),('tax','20'),('charge','5'),('discount','10')]];apply_evidence(d,evidence(use_line_sum=False,parts=parts));self.assertEqual(d['total_amount'],'115.00')
 def test_incomplete_lines(self):
  d=copy.deepcopy(D);apply_evidence(d,evidence(safe_line_indices=[]));self.assertIsNone(d['total_amount'])
 def test_ambiguous_decimal_and_absent_quantity(self):
  self.assertIsNone(number('1,50'));d=copy.deepcopy(D);d['line_items'][0]['quantity']=None;apply_evidence(d,evidence());self.assertIsNone(d['total_amount'])
 def test_no_tax_evidence(self):
  d=copy.deepcopy(D);apply_evidence(d,evidence(parts=[]));self.assertIsNone(d['total_amount'])
if __name__=='__main__':unittest.main()
