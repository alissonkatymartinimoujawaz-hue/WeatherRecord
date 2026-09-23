"""Strict daily/hourly completeness; UTC windows; no gap filling or inferred normals."""
import calendar,csv,datetime as dt,gzip,hashlib,io,json,pathlib,collections,unicodedata
ROOT=pathlib.Path(__file__).resolve().parents[1];WORK=ROOT.parent/'work/station-review';OUT=ROOT/'site/data/stations'
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
manifest=read(WORK/'inmet/manifest.json');catalog=read(OUT/'catalog.json');metadata=read(ROOT/'cache/station-review/inmet-catalog.json')
records=collections.defaultdict(dict);sources=collections.defaultdict(list);positions=collections.defaultdict(list)
def val(s):
    if not s.strip():return None
    x=float(s.replace(',','.'));return None if x<=-999 else x
for batch in manifest:
    for f in batch.get('files',[]):
        raw=pathlib.Path(f['path']).read_bytes();lines=raw.decode('latin-1').splitlines()
        meta={r.split(';')[0].strip(':'):r.split(';')[1] for r in lines[:8]}
        code=meta['CODIGO (WMO)'];header=next(i for i,l in enumerate(lines) if l.upper().startswith(('DATA;', 'DATA (YYYY-MM-DD);')))
        positions[code].append(dict(year=batch['year'],latitude=val(meta['LATITUDE']),longitude=val(meta['LONGITUDE']),elevation_m=val(meta['ALTITUDE'])))
        sha=hashlib.sha256(raw).hexdigest();rawfile=OUT/'raw'/f'{code}-{batch["year"]}.csv.gz';rawfile.write_bytes(gzip.compress(raw,mtime=0))
        sources[code].append(dict(url=f['url'],member=f['member'],year=batch['year'],sha256=sha,raw_path=str(rawfile.relative_to(ROOT/'site')).replace('\\','/')))
        for r in csv.reader(lines[header+1:],delimiter=';'):
            if len(r)<11:continue
            date=r[0].replace('/','-');hour=int(r[1][:2]);time=dt.datetime.fromisoformat(date)+dt.timedelta(hours=hour)
            assert time.isoformat() not in records[code],(code,time)
            records[code][time.isoformat()]=[val(r[2]),val(r[7]),val(r[10]),val(r[9])]
for code,hours in records.items():
    meta=next(s for s in metadata if s['CD_ESTACAO']==code)
    days=collections.defaultdict(lambda:[{}, {}, {}, {}])
    for stamp,values in hours.items():
        time=dt.datetime.fromisoformat(stamp)
        for j,v in enumerate(values):
            # Precipitation and extrema concern the preceding hour; instantaneous Tmean sample does not.
            represented=time if j==1 else time-dt.timedelta(hours=1)
            days[represented.date().isoformat()][j][represented.hour]=v
    rows=[];coverage=[];partial=[]
    for date,metrics in sorted(days.items()):
        if date<'2006-01-01':continue
        counts=[sum(v is not None for v in a.values()) for a in metrics]
        values=[(sum(a.values()) if j==0 else sum(a.values())/24 if j==1 else min(a.values()) if j==2 else max(a.values())) if counts[j]==24 else None for j,a in enumerate(metrics)]
        rows.append([date,*[round(v,4) if v is not None else None for v in values],'','','',counts[1]])
        coverage.append([date,*counts])
        partial.append([date,min(v for v in metrics[2].values() if v is not None) if counts[2] else None,max(v for v in metrics[3].values() if v is not None) if counts[3] else None,counts[2],counts[3]])
    months=collections.defaultdict(list)
    for row in rows:months[row[0][:7]].append(row)
    monthly=[]
    for month,rs in sorted(months.items()):
        y,m=map(int,month.split('-'));n=calendar.monthrange(y,m)[1];counts=[sum(r[j] is not None for r in rs) for j in range(1,5)]
        values=[round(sum(r[j] for r in rs)/(1 if j==1 else n),4) if counts[j-1]==n else None for j in range(1,5)]
        monthly.append([month,*values,*counts,n])
    complete=[r[0] for r in rows if all(v is not None for v in r[1:5])]
    desc=dict(id=code,name=meta['DC_NOME'],latitude=float(meta['VL_LATITUDE']),longitude=float(meta['VL_LONGITUDE']),elevation_m=float(meta['VL_ALTITUDE']),source='INMET automatic station · official hourly archive',retrieved_utc=dt.datetime.now(dt.timezone.utc).isoformat(),first=rows[0][0],last=rows[-1][0],days=len(rows),available_years=[r['year'] for r in sources[code]],time_note='UTC days, 00:00–24:00. Hourly extrema and rainfall assigned to the preceding hour. NASA uses local solar time; midnight boundaries differ.',rain_rule='24 valid hourly reports required per day; all calendar days required per month. Missing is not zero.',extreme_rule='Daily Tmin/Tmax use hourly reported extrema, only with all 24 hours available. Gaps remain blank.')
    payload=dict(**desc,rows=rows,monthly=monthly,hourly_coverage=coverage,partial_extremes=partial,requests=sources[code],station_positions_by_year=positions[code],normal=None,normal_note='No 1991–2020 normal available from this shorter automatic-station record.',last_complete_day=complete[-1] if complete else None)
    write(OUT/f'{code}.json',payload);catalog['stations']=[r for r in catalog['stations'] if r['id']!=code]+[desc]
    print(code,len(rows),'days',len(complete),'complete',flush=True)
for city in catalog['cities']:
    choices=[]
    if city['inmet']:
        nearest=city['inmet'][0];code=nearest['CD_ESTACAO']
        if any(s['id']==code for s in catalog['stations']):choices.append(dict(id=code,distance_km=nearest['distance_km']))
    sid=city['selected_station']
    if sid:choices.append(dict(id=sid,distance_km=city['noaa'][0]['distance_km']))
    city['station_choices']=choices
    # Prefer the retrieved INMET archive; the closer conventional Carmo candidate has no recent GSOD file.
    city['default_station']=choices[0]['id'] if choices else None
catalog['inmet_archive_failures']=[r for r in manifest if 'error' in r]
write(OUT/'catalog.json',catalog)
