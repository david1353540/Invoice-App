import sys,unittest,json
from types import SimpleNamespace
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from invoice_grouping import assemble,group_invoices,TEMPLATE

def page(s='Vendor',n='INV1',c=False,u=False,m=False):return dict(supplier=s,invoice_number=n,continuation=c,uncertain=u,multiple_invoices=m)
class GroupTests(unittest.TestCase):
 def test_only_extractor_reads_pages(self):
  calls=[]
  def chat(payload,timeout,audit):calls.append(payload);return page()
  result=group_invoices(['image-a','image-b'],SimpleNamespace(EXTRACTOR='extractor',SUMMARISER='text-only',chat=chat))
  self.assertEqual(result['groups'][0]['pages'],[0,1])
  for index,payload in enumerate(calls):
   self.assertEqual(payload['model'],'extractor');self.assertFalse(payload['think'])
   self.assertEqual(json.loads(payload['messages'][0]['content']),TEMPLATE)
   self.assertEqual(payload['messages'][-1]['images'],[['image-a'],['image-b']][index])
 def test_distinct_references(self):self.assertEqual([g['pages'] for g in assemble([page(),page(n='INV2')])['groups']],[[0],[1]])
 def test_continuations_and_interleaving(self):self.assertEqual([g['pages'] for g in assemble([page(),page(n='INV2'),page()])['groups']],[[0,2],[1]])
 def test_supplier_collision(self):self.assertEqual(len(assemble([page(),page(s='Other')])['groups']),2)
 def test_missing_identifiers_need_review(self):
  r=assemble([page(),page(s=None,n=None,c=True)]);self.assertTrue(r['needs_review']);self.assertEqual(r['groups'][0]['pages'],[0,1])
 def test_unknown_page_not_silently_merged(self):self.assertEqual(len(assemble([page(),page(s=None,n=None)])['groups']),2)
 def test_conflicting_continuation(self):self.assertEqual(len(assemble([page(),page(n='INV2',c=True)])['groups']),2)
 def test_punctuation_preserved(self):self.assertEqual(len(assemble([page(n='INV-1'),page(n='INV1')])['groups']),2)
 def test_two_invoices_on_one_image(self):
  with self.assertRaisesRegex(ValueError,'Crop'):assemble([page(m=True)])
if __name__=='__main__':unittest.main()
