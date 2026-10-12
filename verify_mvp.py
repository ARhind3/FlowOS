#!/usr/bin/env python3
import json, pathlib, re, subprocess, sys
root = pathlib.Path(__file__).parent
required = ['index.html','styles.css','app.js','manifest.webmanifest','sw.js','assets/icon-192.png','assets/icon-512.png','samples/sample-flow.json']
missing = [x for x in required if not (root/x).exists()]
if missing:
    raise SystemExit('Missing: ' + ', '.join(missing))
subprocess.run(['node','--check',str(root/'app.js')], check=True)
manifest = json.loads((root/'manifest.webmanifest').read_text())
sample = json.loads((root/'samples/sample-flow.json').read_text())
assert manifest['display'] == 'standalone'
assert sample['format'] == 'P3_FLYING_LOGIC_EXCHANGE'
assert sample['version'] == '0.3'
ids = {x['id'] for k in ('entities','junctors','groups','edges') for x in sample[k]}
assert len(ids) == sum(len(sample[k]) for k in ('entities','junctors','groups','edges'))
node_ids = {x['id'] for x in sample['entities']} | {x['id'] for x in sample['junctors']}
for edge in sample['edges']:
    assert edge['from'] in node_ids and edge['to'] in node_ids, edge
assert any(j['operator'] == 'AND' for j in sample['junctors'])
html = (root/'index.html').read_text()
for ref in re.findall(r'(?:href|src)="([^"]+)"', html):
    if ref.startswith(('http:','https:','#')): continue
    if not (root/ref).exists():
        raise AssertionError(f'Broken local asset ref: {ref}')
print('FlowOS Logic MVP verification passed.')
print(f"Sample: {len(sample['entities'])} entities, {len(sample['junctors'])} junctor(s), {len(sample['edges'])} edges")
