import json,pathlib,concurrent.futures
from inmet_archive import extract
ROOT=pathlib.Path(__file__).resolve().parents[1]
DEST=ROOT.parent/'work/station-review/inmet'
def run(year):
    try:return dict(year=year,files=extract(year,['A515','A531','A524','A523','A556','A616','A529'],DEST))
    except Exception as e:return dict(year=year,error=str(e))
out=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for r in pool.map(run,range(2006,2027)):
        out.append(r);print(r['year'],len(r.get('files',[])),r.get('error',''),flush=True)
(DEST/'manifest.json').write_text(json.dumps(out),encoding='utf-8')
