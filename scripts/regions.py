"""Explicit fixed geographic definitions; city points are not area averages."""
import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
REGIONS=json.loads((ROOT/'site/data/regions.json').read_text(encoding='utf-8'))
def paths(region):
 suffix='' if region['id']=='sul' else region['id']
 return ROOT/'site/data'/suffix,ROOT/'cache'/suffix
