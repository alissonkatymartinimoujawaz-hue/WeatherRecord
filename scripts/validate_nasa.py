"""Independently check transcription and arithmetic, not ground-station accuracy."""
import calendar,datetime as dt,gzip,hashlib,json,math,statistics
from collections import defaultdict
from urllib.parse import urlparse,parse_qs
from regions import REGIONS,paths,ROOT
from data_core import write
KEYS=['PRECTOTCORR','T2M','T2M_MIN','T2M_MAX','GWETROOT']
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def near(a,b):
 assert (a is None and b is None) or (a is not None and b is not None and math.isclose(a,b,abs_tol=2e-6)),(a,b)
def verify_summary(d):
 months=defaultdict(list);baseline=defaultdict(list)
 for i,r in enumerate(d['rows']):
  assert r[0]==str(dt.date(1981,1,1)+dt.timedelta(days=i))
  assert all(v is None or math.isfinite(v) for v in r[1:5])
  if r[5]!='missing':assert r[1]>=0 and r[3]<=r[2]<=r[4]
  months[r[0][:7]].append(r)
  if 1991<=int(r[0][:4])<=2020:baseline[r[0][5:]].append(r)
 assert len(d['monthly'])==len(months)
 for published in d['monthly']:
  key=published[0];rs=months[key];y,m=map(int,key.split('-'));ok=len(rs)==calendar.monthrange(y,m)[1] and all(r[5]!='missing' for r in rs)
  assert ok==published[5] and not published[6]
  for j in range(1,5):near(published[j],(sum(r[j] for r in rs) if j==1 else statistics.mean(r[j] for r in rs)) if ok else None)
 for m in range(1,13):
  rs=[r for r in d['monthly'] if 1991<=int(r[0][:4])<=2020 and int(r[0][5:])==m]
  assert len(rs)==30 and all(r[5] for r in rs)
  for j in range(4):near(d['normal'][m-1][j],statistics.mean(r[j+1] for r in rs))
 assert len(baseline)==366
 for md,rs in baseline.items():
  assert len(rs)==(8 if md=='02-29' else 30)==d['daily_normal'][md][4]
  for j in range(4):near(d['daily_normal'][md][j],statistics.mean(r[j+1] for r in rs))
 if 'soil_daily' in d:
  soil=d['soil_daily'];assert set(soil)=={r[0] for r in d['rows']}
  assert all(v is None or 0<=v<=1 for v in soil.values())
  for key,rs in months.items():
   y,m=map(int,key.split('-'));vs=[soil[r[0]] for r in rs];ok=len(vs)==calendar.monthrange(y,m)[1] and all(v is not None for v in vs)
   near(d['soil_monthly'][key],statistics.mean(vs) if ok else None)
  for md,rs in baseline.items():near(d['soil_daily_normal'][md],statistics.mean(soil[r[0]] for r in rs))
  for m in range(1,13):near(d['soil_normal'][m-1],statistics.mean(d['soil_monthly'][f'{y}-{m:02d}'] for y in range(1991,2021)))

for region in REGIONS:
 folder,cache=paths(region);file=folder/'nasa_daily.json';d=read(file);pro=read(folder/'nasa_provenance.json');stored=read(cache/'nasa-daily-points.json')
 assert d['region_id']==region['id']==pro['region_id'] and d['points']==region['points']==pro['points']
 assert d['timezone']=='LST' and d['reference']==[1991,2020]
 assert pro['weights']==[1/len(region['points'])]*len(region['points'])
 rebuilt={};configs={p['name']:p for p in region['points']}
 for request in pro['requests']:
  raw=gzip.decompress((ROOT/'site'/request['raw_path']).read_bytes());assert hashlib.sha256(raw).hexdigest()==request['sha256'];p=json.loads(raw)
  url=urlparse(request['url']);q=parse_qs(url.query);point=configs[request['point']]
  assert url.netloc=='power.larc.nasa.gov' and url.path=='/api/temporal/daily/point'
  assert float(q['latitude'][0])==point['latitude'] and float(q['longitude'][0])==point['longitude']
  assert q['time-standard']==['LST'] and q['parameters'][0].split(',')==KEYS
  assert p['header']['time_standard']=='LST'
  assert abs(p['geometry']['coordinates'][0]-point['longitude'])<.001 and abs(p['geometry']['coordinates'][1]-point['latitude'])<.001
  assert [p['parameters'][k]['units'] for k in KEYS]==['mm/day','C','C','C','1']
  start=dt.datetime.strptime(q['start'][0],'%Y%m%d').date();end=dt.datetime.strptime(q['end'][0],'%Y%m%d').date()
  expected={(start+dt.timedelta(days=i)).strftime('%Y%m%d') for i in range((end-start).days+1)}
  pp=p['properties']['parameter'];assert all(set(pp[k])==expected for k in KEYS)
  target=rebuilt.setdefault(point['name'],{});fill=p['header']['fill_value']
  for day in expected:target[f'{day[:4]}-{day[4:6]}-{day[6:]}']=[None if pp[k][day]==fill else pp[k][day] for k in KEYS]
 assert rebuilt==stored,'Cache differs from NASA responses'
 aliases=d['aliases'];n=len(region['points'])
 for row in d['rows']:
  day=row[0];values=[stored[aliases.get(p['name'],p['name'])].get(day,[None]*5) for p in region['points']]
  for j in range(5):near(row[j+1] if j<4 else d['soil_daily'][day],sum(v[j] for v in values)/n if all(v[j] is not None for v in values) else None)
  assert (row[5]=='missing')==any(v is None for v in row[1:5])
 verify_summary(d)
 assert d['last_date']==max(r[0] for r in d['rows'] if r[5]!='missing')
 spots=read(folder/'spot_checks.json')
 for req in spots:
  raw=gzip.decompress((ROOT/'site'/req['raw_path']).read_bytes());assert hashlib.sha256(raw).hexdigest()==req['sha256']
 report=dict(region_id=region['id'],checked_utc=dt.datetime.now(dt.timezone.utc).isoformat(),data_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),result='passed',daily_rows=len(d['rows']),raw_responses_verified=len(pro['requests']),last_complete_day=d['last_date'],last_wetness_day=max(k for k,v in d['soil_daily'].items() if v is not None),missing_days=sum(r[5]=='missing' for r in d['rows']),checks=['NASA URL, coordinates, units, dates and raw-response SHA-256','Full raw response to point-cache equality','Every daily regional value independently recalculated','Every monthly aggregate and 1991–2020 normal independently recalculated','Leap-day reference count: 8'],fresh_request_spot_checks=[dict(point=r['point'],days_compared=r['days_compared'],retrieved_utc=r['retrieved_utc'],matched=r['matched']) for r in spots],station_validation=False,limitation='Arithmetic and transcription checks, not validation of weather accuracy against local observations.')
 write(folder/'audit.json',report);print(region['id'],report['result'],report['daily_rows'],report['last_complete_day'])

era=read(ROOT/'site/data/era5_archive.json');assert era['archived'] and all(r[5] in ('era5','era5_recent','missing') for r in era['rows']);verify_summary(era)
print('ERA5 archive: checked, no IFS tail.')
