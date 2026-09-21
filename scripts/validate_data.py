"""Checks on published real data: chronology, missingness and climatology."""
import json, pathlib, datetime as dt, calendar, math
root=pathlib.Path(__file__).resolve().parents[1]
d=json.loads((root/'site/data/weather.json').read_text(encoding='utf-8'))
rows=d['rows']; assert rows[0][0]=='1981-01-01'
for i,r in enumerate(rows):
 assert r[0]==str(dt.date(1981,1,1)+dt.timedelta(days=i))
 assert all(v is None or math.isfinite(v) for v in r[1:5])
 if r[5]!='missing': assert r[1]>=0 and r[3]<=r[2]<=r[4]
assert d['daily_normal']['02-29'][4]==8
assert all(v[4]==30 for k,v in d['daily_normal'].items() if k!='02-29')
for month in d['monthly']:
 rs=[r for r in rows if r[0][:7]==month[0]]
 y,m=map(int,month[0].split('-'))
 complete=len(rs)==calendar.monthrange(y,m)[1] and all(r[5]!='missing' for r in rs)
 assert complete==month[5]
 if complete:
  for j in range(1,5): assert abs(month[j]-sum(r[j] for r in rs)/(1 if j==1 else len(rs)))<1e-5
 else: assert month[1:5]==[None]*4
for m in range(1,13):
 rs=[r for r in d['monthly'] if 1991<=int(r[0][:4])<=2020 and int(r[0][5:])==m]
 assert len(rs)==30
 for j in range(4): assert abs(d['normal'][m-1][j]-sum(r[j+1] for r in rs)/30)<1e-5
n=json.loads((root/'site/data/nasa.json').read_text(encoding='utf-8'))
assert len(n['normal'])==12 and all(len(r)==5 for r in n['normal'])
assert all(r[5] is None or 0<=r[5]<=1 for r in n['monthly'])
print('Validated',len(rows),'daily rows, monthly completeness, normals, and NASA wetness.')
