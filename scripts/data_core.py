"""Daily-to-monthly calculations shared by collectors; no filling missing days."""
import calendar,csv,datetime as dt,hashlib,json,gzip,math,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
def write(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8');tmp.replace(path)
def archive(raw,folder):
 digest=hashlib.sha256(raw).hexdigest();dest=folder/'raw'/(digest+'.json.gz');dest.parent.mkdir(parents=True,exist_ok=True)
 if not dest.exists():dest.write_bytes(gzip.compress(raw,mtime=0))
 return digest,str(dest.relative_to(ROOT/'site')).replace('\\','/')
def finite(v):return isinstance(v,(int,float)) and math.isfinite(v) and v!=-999
def summarize(rows,region,source,timezone,as_of,soil=None):
 complete=[r for r in rows if r[5]!='missing']
 if not complete:raise ValueError('No complete daily data')
 months={};baseline={}
 for r in rows:
  months.setdefault(r[0][:7],[]).append(r)
  if 1991<=int(r[0][:4])<=2020 and r[5]!='missing':baseline.setdefault(r[0][5:],[]).append(r)
 monthly=[]
 for key,rs in sorted(months.items()):
  yy,mm=map(int,key.split('-'));n=calendar.monthrange(yy,mm)[1]
  ok=len(rs)==n and all(r[5]!='missing' for r in rs)
  vv=[round(sum(r[j] for r in rs)/(1 if j==1 else n),6) for j in range(1,5)] if ok else [None]*4
  monthly.append([key]+vv+[ok,any(r[5]=='ifs_provisional' for r in rs)])
 normal=[]
 for m in range(1,13):
  rs=[r for r in monthly if 1991<=int(r[0][:4])<=2020 and int(r[0][5:])==m and r[5]]
  if len(rs)!=30:raise ValueError(f'Incomplete baseline month {m}')
  normal.append([round(sum(r[j] for r in rs)/30,6) for j in range(1,5)])
 dn={k:[*[round(sum(r[j] for r in rs)/len(rs),6) for j in range(1,5)],len(rs)] for k,rs in baseline.items()}
 if len(dn)!=366 or any(v[4]!=(8 if k=='02-29' else 30) for k,v in dn.items()):raise ValueError('Incomplete daily baseline')
 p=dict(region_id=region['id'],region_name=region['name'],updated_utc=dt.datetime.now(dt.timezone.utc).isoformat(),as_of=str(as_of),last_date=complete[-1][0],timezone=timezone,points=region['points'],reference=[1991,2020],columns=['date','rain_mm','tmean_c','tmin_c','tmax_c','status'],rows=rows,monthly=monthly,normal=normal,daily_normal=dn,source=source)
 if soil is not None:
  sm={};sn={}
  for k,rs in months.items():
   yy,mm=map(int,k.split('-'));vals=[soil.get(r[0]) for r in rs]
   sm[k]=round(sum(vals)/len(vals),6) if len(vals)==calendar.monthrange(yy,mm)[1] and all(finite(v) for v in vals) else None
  for k,rs in baseline.items():
   vals=[soil.get(r[0]) for r in rs]
   sn[k]=round(sum(vals)/len(vals),6) if all(finite(v) for v in vals) else None
  mn=[]
  for m in range(1,13):
   vals=[sm.get(f'{yy}-{m:02d}') for yy in range(1991,2021)]
   mn.append(round(sum(vals)/30,6) if all(finite(v) for v in vals) else None)
  p.update(soil_daily=soil,soil_monthly=sm,soil_daily_normal=sn,soil_normal=mn)
 return p
def publish(folder,name,payload):
 write(folder/(name+'.json'),payload)
 with (folder/(name+'.csv')).open('w',newline='',encoding='utf-8') as f:
  w=csv.writer(f);w.writerow(payload['columns']+(['gwetroot_fraction'] if 'soil_daily' in payload else []))
  for r in payload['rows']:w.writerow(r+([payload['soil_daily'].get(r[0])] if 'soil_daily' in payload else []))
