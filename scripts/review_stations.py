"""One-off public station review. Does not replace the scheduled NASA collector."""
import calendar,csv,datetime as dt,gzip,hashlib,io,json,math,pathlib,urllib.request,urllib.error
from concurrent.futures import ThreadPoolExecutor
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=ROOT.parent/'work/station-review'
OUT=ROOT/'site/data/stations'
OUT.mkdir(parents=True,exist_ok=True)
inventory=json.loads((ROOT/'cache/station-review/inventory.json').read_text(encoding='utf-8'))
selected={}
for item in inventory:
    # Coastal Phan Thiet is not a defensible proxy for highland Bao Loc.
    item['selected_station']=None if item['region']=='lam-dong' else item['noaa'][0]['USAF']+item['noaa'][0]['WBAN']
    if item['selected_station']:selected[item['selected_station']]=item['noaa'][0]
selected['86871099999']=next(s for x in inventory for s in x['noaa'] if s['USAF']=='868710')
jobs=[(sid,y) for sid,s in selected.items() for y in range(max(1991,int(s['BEGIN'][:4])),2027)]
def download(job):
    sid,y=job;url=f'https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{y}/{sid}.csv';p=WORK/f'{sid}-{y}.csv'
    if p.exists():return sid,y,url,p.read_bytes(),None
    try:
        with urllib.request.urlopen(url,timeout=45) as response:raw=response.read()
        if not raw.startswith(b'"STATION"'):raise ValueError('Not station CSV')
        p.write_bytes(raw);return sid,y,url,raw,None
    except Exception as e:return sid,y,url,None,str(e)
results=[]
with ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(download,jobs):
        results.append(result)
        if len(results)%20==0:print('Station files checked',len(results),'/',len(jobs),flush=True)
def temp(v):
    x=float(v);return None if x==9999.9 else round((x-32)*5/9,4)
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
catalog=[]
for sid,meta in selected.items():
    rows=[];requests=[];unavailable=[]
    for station,y,url,raw,error in results:
        if station!=sid:continue
        if raw is None:unavailable.append(dict(year=y,error=error));continue
        sha=hashlib.sha256(raw).hexdigest();rawpath=OUT/'raw'/f'{sid}-{y}.csv.gz';rawpath.parent.mkdir(exist_ok=True);rawpath.write_bytes(gzip.compress(raw,mtime=0))
        requests.append(dict(year=y,url=url,sha256=sha,raw_path=str(rawpath.relative_to(ROOT/'site')).replace('\\','/')))
        for r in csv.DictReader(io.StringIO(raw.decode())):
            assert r['STATION']==sid and r['DATE'].startswith(str(y))
            rain=float(r['PRCP']);flag=r['PRCP_ATTRIBUTES'].strip()
            # Retain only explicit 24-hour totals D/F/G. Partial/uncertain totals stay missing.
            rain=None if rain==99.99 or flag not in ('D','F','G') else round(rain*25.4,4)
            rows.append([r['DATE'],rain,temp(r['TEMP']),temp(r['MIN']),temp(r['MAX']),r['MIN_ATTRIBUTES'].strip(),r['MAX_ATTRIBUTES'].strip(),flag,int(r['TEMP_ATTRIBUTES'])])
    rows.sort();assert len({r[0] for r in rows})==len(rows)
    months={}
    for r in rows:months.setdefault(r[0][:7],[]).append(r)
    monthly=[]
    for month,rs in months.items():
        y,m=map(int,month.split('-'));n=calendar.monthrange(y,m)[1];counts=[sum(r[j] is not None for r in rs) for j in range(1,5)]
        vals=[round(sum(r[j] for r in rs)/(1 if j==1 else n),4) if counts[j-1]==n else None for j in range(1,5)]
        monthly.append([month,*vals,*counts,n])
    payload=dict(id=sid,name=meta['STATION NAME'],latitude=float(meta['LAT']),longitude=float(meta['LON']),elevation_m=float(meta['ELEV(M)']),source='NOAA NCEI GSOD station observations',retrieved_utc=dt.datetime.now(dt.timezone.utc).isoformat(),columns=['date','rain_mm_strict_24h','tmean_c','tmin_c','tmax_c','tmin_flag','tmax_flag','rain_flag','tmean_observation_count'],rows=rows,monthly=monthly,requests=requests,unavailable_years=unavailable,normal=None,normal_note='No station climatological normal inferred from a short or incomplete record.',time_note='GSOD reporting day. Extremes and rainfall reporting intervals can cross calendar-day boundaries; not identical to NASA LST.',rain_rule='Only explicit 24-hour totals (D/F/G); A/B/C/E/H/I and missing values excluded. Missing is not zero.',extreme_rule='An asterisk flags an extreme inferred from sampled hourly/synoptic readings, not an explicit extreme report.')
    write(OUT/f'{sid}.json',payload)
    catalog.append({k:payload[k] for k in ['id','name','latitude','longitude','elevation_m','source','retrieved_utc','time_note','rain_rule','extreme_rule'] }|dict(first=rows[0][0] if rows else None,last=rows[-1][0] if rows else None,days=len(rows),available_years=[q['year'] for q in requests]))
write(OUT/'catalog.json',dict(cities=inventory,stations=catalog,reviewed_utc=dt.datetime.now(dt.timezone.utc).isoformat(),inventory_sources=['https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv','https://apitempo.inmet.gov.br/estacoes/T'],documentation='https://www.ncei.noaa.gov/data/global-summary-of-the-day/doc/readme.txt',rejected=[dict(city='Bảo Lộc',candidate='Phan Thiet',reason='75 km away on the coast; unsuitable default proxy for a highland city. No verified local station series integrated.')]))
print('Station review complete:',len(catalog),'stations',sum(x['days'] for x in catalog),'station-days',flush=True)
