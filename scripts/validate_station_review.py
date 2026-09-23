"""Independent station/month checks and individual NASA city-to-cache equality."""
import calendar,collections,csv,datetime as dt,gzip,hashlib,io,json,math,pathlib,statistics
ROOT=pathlib.Path(__file__).resolve().parents[1];SITE=ROOT/'site';OUT=SITE/'data/stations'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def near(a,b):assert a is None and b is None or a is not None and b is not None and abs(a-b)<0.00011,(a,b)
catalog=read(OUT/'catalog.json');reports=[]
for entry in catalog['stations']:
    d=read(OUT/(entry['id']+'.json'));dates=[r[0] for r in d['rows']]
    assert dates==sorted(set(dates))
    months=collections.defaultdict(list)
    for r in d['rows']:
        dt.date.fromisoformat(r[0]);months[r[0][:7]].append(r)
        assert all(v is None or math.isfinite(v) for v in r[1:5])
        assert r[1] is None or r[1]>=0
    for row in d['monthly']:
        yy,mm=map(int,row[0].split('-'));n=calendar.monthrange(yy,mm)[1];rs=months[row[0]]
        for j in range(1,5):
            vs=[r[j] for r in rs if r[j] is not None];assert row[j+4]==len(vs)
            near(row[j],(sum(vs) if j==1 else statistics.mean(vs)) if len(vs)==n else None)
    rebuilt=collections.defaultdict(lambda:[{}, {}, {}, {}]);noaa={}
    for source in d['requests']:
        raw=gzip.decompress((SITE/source['raw_path']).read_bytes());assert hashlib.sha256(raw).hexdigest()==source['sha256']
        if entry['id'].startswith('A'):
            lines=raw.decode('latin-1').splitlines();start=next(i for i,s in enumerate(lines) if s.upper().startswith(('DATA;','DATA (YYYY-MM-DD);')))
            for r in csv.reader(lines[start+1:],delimiter=';'):
                if len(r)<11:continue
                stamp=dt.datetime.fromisoformat(r[0].replace('/','-'))+dt.timedelta(hours=int(r[1][:2]))
                for j,col in enumerate([2,7,10,9]):
                    v=float(r[col].replace(',','.')) if r[col].strip() else None
                    if v is not None and v<=-999:v=None
                    t=stamp-dt.timedelta(hours=0 if j==1 else 1)
                    rebuilt[t.date().isoformat()][j][t.hour]=v
        else:
            for r in csv.DictReader(io.StringIO(raw.decode())):noaa[r['DATE']]=r
    coverage={r[0]:r[1:] for r in d.get('hourly_coverage',[])}
    partial={r[0]:r for r in d.get('partial_extremes',[])}
    for r in d['rows']:
        if entry['id'].startswith('A'):
            for j,values in enumerate(rebuilt[r[0]]):
                vs=[v for v in values.values() if v is not None];assert coverage[r[0]][j]==len(vs)
                expected=(sum(vs) if j==0 else statistics.mean(vs) if j==1 else min(vs) if j==2 else max(vs)) if len(vs)==24 else None
                near(r[j+1],expected)
                if j>=2:
                    near(partial[r[0]][j-1],(min(vs) if j==2 else max(vs)) if vs else None)
                    assert partial[r[0]][j+1]==len(vs)
        else:
            raw=noaa[r[0]]
            for j,key in [(2,'TEMP'),(3,'MIN'),(4,'MAX')]:
                v=float(raw[key]);near(r[j],None if v==9999.9 else (v-32)*5/9)
            v=float(raw['PRCP']);near(r[1],None if v==99.99 or raw['PRCP_ATTRIBUTES'].strip() not in ('D','F','G') else v*25.4)
    reports.append(dict(station=entry['id'],days=len(d['rows']),months=len(d['monthly']),raw_files=len(d['requests']),result='passed'))
    print(entry['id'],'raw -> daily -> monthly passed',flush=True)
from validate_nasa import verify_summary
for city in read(SITE/'data/cities/catalog.json'):
    d=read(SITE/city['path']);folder='' if city['region']=='sul' else city['region'];cache=read(ROOT/'cache'/folder/'nasa-daily-points.json');key=d.get('shared_grid_with') or city['city']
    for r in d['rows']:
        raw=cache[key].get(r[0],[None]*5)
        for j in range(4):near(r[j+1],raw[j])
    assert d['reference']==[1991,2020]
    verify_summary(d)
    print(city['id'],'city/cache equality passed',flush=True)
(OUT/'validation.json').write_text(json.dumps(dict(checked_utc=dt.datetime.now(dt.timezone.utc).isoformat(),result='passed',stations=reports,city_series=9,scope='Raw-source transcription and complete-period arithmetic; not certification of representativeness or instrument calibration.'),indent=2),encoding='utf-8')
