"""Extract each page once, then summarise deterministic invoice groups."""
import copy
import json
import time
from invoice_grouping import assemble
from invoice_checks import run

def extract_pages(images, pipeline, audit=None):
    started = time.monotonic()
    deadline = started + 820
    pages, identities, events = [], [], []
    def chat(payload, timeout, audit_arg=None):
        remaining = deadline - time.monotonic()
        if remaining <= 1:
            raise TimeoutError('Page extraction exceeded the time limit.')
        return pipeline.chat(payload, min(timeout, remaining), audit_arg)
    template = {'invoice': pipeline.TEMPLATE, 'continuation': 'boolean', 'multiple_invoices': 'boolean'}
    for index, image in enumerate(images):
        feedback = []
        for attempt in range(2):
            prompt = pipeline.INSTRUCTIONS + '''
Read ONLY this page. Missing header fields, dates, totals or line items on a continuation/notes
page are normal: return null or an empty list. Do not use page subtotals, carried-forward
balances or amounts brought forward as a grand total or line item. continuation is true only
if this page explicitly says it continues an invoice (such as Page 2 of 3). multiple_invoices
is true only if this single image contains separate invoices, not references to other invoices.'''
            if feedback:
                prompt += '\nCorrect these validation errors, never invent values: ' + json.dumps(feedback)
            try:
                value = chat({'model': pipeline.EXTRACTOR, 'think': False, 'stream': False,
                    'keep_alive': '10m', 'options': {'temperature': 0, 'num_ctx': 16384, 'num_predict': 6000},
                    'messages': [{'role': 'template', 'content': json.dumps(template)},
                                 {'role': 'instructions', 'content': prompt},
                                 {'role': 'user', 'content': '', 'images': [image]}]}, 600, audit)
                if not isinstance(value, dict) or set(value) != set(template) or any(type(value[k]) is not bool for k in ('continuation','multiple_invoices')):
                    raise ValueError('Invalid page extraction structure.')
                pipeline.validate_extraction(value['invoice'])
                if any(not item['description'].strip() for item in value['invoice']['line_items']):
                    raise ValueError('Unreadable line description.')
                feedback = []
            except (ValueError, TypeError, KeyError, IndexError) as error:
                feedback = [str(error)]
            events.append({'stage': 'page_extraction', 'page': index, 'attempt': attempt + 1, 'issues': feedback[:]})
            if not feedback:
                break
        if feedback:
            raise ValueError(f'Page {index+1} could not be extracted. No pages have been discarded.')
        data = value['invoice']
        pages.append(data)
        identities.append({'supplier': data['supplier'], 'invoice_number': data['invoice_number'],
            'continuation': value['continuation'], 'multiple_invoices': value['multiple_invoices'],
            'uncertain': not (data['supplier'] and data['invoice_number'])})
    plan = assemble(identities)
    outputs, prepared = [], []
    extraction_seconds = time.monotonic() - started
    for group in plan['groups']:
        merged = copy.deepcopy(pages[group['pages'][0]])
        merged['line_items'], merged['invoice_notes'], merged['warnings'] = [], [], []
        for index in group['pages']:
            merged['line_items'].extend(copy.deepcopy(pages[index]['line_items']))
            for field in ('invoice_notes', 'warnings'):
                merged[field].extend(v for v in pages[index][field] if v not in merged[field])
        conflicts = []
        for field in ('supplier','invoice_number','invoice_date','currency','total_amount'):
            values = list(dict.fromkeys(pages[i][field] for i in group['pages'] if pages[i][field] is not None))
            if len(values) > 1:
                conflicts.append(f'Conflicting {field} across these pages; please check the original.')
                merged[field] = None
            else:
                merged[field] = values[0] if values else None
        if any(identities[i]['uncertain'] for i in group['pages']):
            conflicts.append('Incomplete page identification: check that these pages belong together.')
        merged['warnings'].extend(conflicts)
        prepared.append((group, merged, conflicts))
    # Complete every image-based repair before the first text summary starts.
    from invoice_amounts import recover
    for group, merged, conflicts in prepared:
        if not conflicts:
            try:
                recover(merged, [images[i] for i in group['pages']],
                        lambda payload, timeout: chat(payload, timeout, audit), vars(pipeline))
            except (ValueError, TypeError, KeyError, IndexError, OSError):
                merged['calculated_amounts'] = []
    for group, merged, conflicts in prepared:
        settings = dict(vars(pipeline))
        settings['chat'] = chat
        settings['SUMMARY_THINK'] = False
        result = run([images[i] for i in group['pages']], audit, settings, extracted_data=merged,
                     allow_amount_recovery=False)
        result['pages'] = group['pages']
        result['quality_check']['events'] = [e for e in events if e['page'] in group['pages']] + result['quality_check']['events']
        result['quality_check']['retried'] = any(e['attempt'] > 1 for e in result['quality_check']['events'])
        if conflicts:
            result['quality_check']['status'] = 'needs_review'
        outputs.append(result)
    return {'invoices': outputs, 'page_count': len(images), 'seconds': round(time.monotonic()-started,1),
            'page_extraction_seconds': round(extraction_seconds,1), 'model': pipeline.LABEL}
