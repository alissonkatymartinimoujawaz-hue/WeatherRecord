"""Public weather data. Python standard library only; missing values stay null.
ERA5 is refreshed over 100 days; the IFS tail is rebuilt, never spliced into history.
"""
import argparse,calendar,csv,datetime as dt,hashlib,json,math,pathlib,time,urllib.request,urllib.parse,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1];DATA=ROOT/'site'/'data';CACHE=ROOT/'cache'
VARS=['precipitation_sum','temperature_2m_mean','temperature_2m_min','temperature_2m_max']
POINTS=[{'name':'Varginha','latitude':-21.56,'longitude':-45.43},{'name':'Carmo de Minas','latitude':-22.121944,'longitude':-45.128889},{'name':'Boa Esperança','latitude':-21.083333,'longitude':-45.55},{'name':'Guapé','latitude':-20.761944,'longitude':-45.917778}]
def write(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8');tmp.replace(path)
def fetch(model,start,end):
 params=dict(latitude=','.join(str(p['latitude']) for p in POINTS),longitude=','.join(str(p['longitude']) for p in POINTS),start_date=str(start),end_date=str(end),daily=','.join(VARS),models=model,timezone='America/Sao_Paulo',elevation=','.join(['nan']*len(POINTS)),cell_selection='nearest')
 url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params)
 for attempt in range(4):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'WeatherRecord/1.0'}),timeout=180) as r:raw=r.read()
   responses=json.loads(raw)
   if not isinstance(responses,list) or len(responses)!=4:raise ValueError('Expected four point responses')
   if any('daily' not in p for p in responses):raise ValueError('Missing daily data')
   return responses,{'url':url,'retrieved_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'model':model,'grid':[{'point':POINTS[i]['name'],'latitude':p['latitude'],'longitude':p['longitude'],'elevation':p.get('elevation'),'timezone':p.get('timezone')} for i,p in enumerate(responses)]}
  except Exception as error:
   if isinstance(error,urllib.error.HTTPError):print('API',error.code,error.read().decode()[:220],flush=True)
   if attempt==3:raise
   time.sleep(35*(attempt+1))
def average_points(responses):
 maps=[{date:[p['daily'][v][i] for v in VARS] for i,date in enumerate(p['daily']['time'])} for p in responses]
 rows={}
 for date in sorted(set().union(*(m.keys() for m in maps))):
  vv=[]
  for j in range(4):
   values=[m.get(date,[None]*4)[j] for m in maps]
   vv.append(round(sum(values)/4,6) if all(isinstance(x,(float,int)) and math.isfinite(x) for x in values) else None)
  if all(v is not None for v in vv):
   if vv[0]<0 or not vv[2]<=vv[1]<=vv[3]:raise ValueError('Invalid meteorological data '+date)
  rows[date]=vv
 return rows
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--as-of',default=dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat());args=parser.parse_args()
 today=dt.date.fromisoformat(args.as_of);yesterday=today-dt.timedelta(days=1);cutoff=today-dt.timedelta(days=6)
 history_path=CACHE/'era5-regional.json';history=json.loads(history_path.read_text()) if history_path.exists() else {}
 manifest_path=CACHE/'requests.json';manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else []
 if not history:
  start=dt.date(1981,1,1)
 else:start=max(dt.date(1981,1,1),dt.date.fromisoformat(max(history))-dt.timedelta(days=100))
 while start<=cutoff:
  end=min(dt.date(start.year+9,12,31),cutoff)
  print('ERA5',start,end,flush=True);responses,meta=fetch('era5',start,end);batch=average_points(responses)
  # Do not replace a previously complete ERA5 day with an unavailable response.
  for date,values in batch.items():
   if all(v is not None for v in values) or date not in history:history[date]=values
  manifest.append(meta);write(history_path,history);write(manifest_path,manifest)
  start=end+dt.timedelta(days=1)
 good=[date for date,v in history.items() if all(x is not None for x in v) and date<=str(cutoff)]
 if not good:raise ValueError('No complete ERA5 day')
 era_end=max(good);tail={};tail_start=dt.date.fromisoformat(era_end)+dt.timedelta(days=1)
 if tail_start<=yesterday:
  print('IFS provisional',tail_start,yesterday,flush=True);responses,meta=fetch('ecmwf_ifs',tail_start,yesterday);tail=average_points(responses);manifest.append(meta)
 rows=[];date=dt.date(1981,1,1)
 while date<=yesterday:
  key=str(date);is_era=key<=era_end
  values=history.get(key) if is_era else tail.get(key)
  status=('era5_recent' if date>today-dt.timedelta(days=95) else 'era5') if is_era else 'ifs_provisional'
  if values is None:values=[None]*4
  if any(v is None for v in values):status='missing'
  rows.append([key]+values+[status]);date+=dt.timedelta(days=1)
 complete=[r for r in rows if r[5]!='missing']
 if not complete:raise ValueError('No output data')
 # Monthly values are only published when every calendar day is present.
 grouped={}
 for r in rows:grouped.setdefault(r[0][:7],[]).append(r)
 monthly=[]
 for month,rs in sorted(grouped.items()):
  y,m=map(int,month.split('-'));nd=calendar.monthrange(y,m)[1];ok=len(rs)==nd and all(r[5]!='missing' for r in rs)
  v=[round(sum(r[j] for r in rs)/(1 if j==1 else nd),6) for j in range(1,5)] if ok else [None]*4
  monthly.append([month]+v+[ok,any(r[5]=='ifs_provisional' for r in rs)])
 normal=[]
 for m in range(1,13):
  rs=[r for r in monthly if 1991<=int(r[0][:4])<=2020 and int(r[0][5:])==m and r[5]]
  if len(rs)!=30:raise ValueError(f'Incomplete 1991–2020 climatology for month {m}: {len(rs)}')
  normal.append([round(sum(r[j] for r in rs)/30,6) for j in range(1,5)])
 # Daily normals keyed by month-day. Leap day uses the eight actual leap years.
 dn={}
 for r in rows:
  if 1991<=int(r[0][:4])<=2020 and r[5]!='missing':dn.setdefault(r[0][5:],[]).append(r)
 daily_normal={key:[*[round(sum(r[j] for r in rs)/len(rs),6) for j in range(1,5)],len(rs)] for key,rs in dn.items()}
 payload={'updated_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'as_of':str(today),'last_date':complete[-1][0],'era5_through':era_end,'timezone':'America/Sao_Paulo','points':POINTS,'reference':[1991,2020],'columns':['date','rain_mm','tmean_c','tmin_c','tmax_c','status'],'rows':rows,'monthly':monthly,'normal':normal,'daily_normal':daily_normal,'source':'ERA5 via Open-Meteo; recent tail ECMWF IFS, provisional'}
 write(DATA/'weather.json',payload);write(manifest_path,manifest)
 write(DATA/'provenance.json',{'points':POINTS,'weights':[.25]*4,'requests':manifest,'baseline':'1991–2020','aggregation':'four valid points required per variable, no gap filling; monthly requires all days','sources':['https://open-meteo.com/en/docs/historical-weather-api','https://www.ecmwf.int/en/forecasts/dataset/era5t-era5-initial-release-data']})
 with (DATA/'weather.csv').open('w',newline='',encoding='utf-8') as f:
  w=csv.writer(f);w.writerow(payload['columns']);w.writerows(rows)
 print('Published data',len(rows),'days; latest',payload['last_date'],flush=True)
if __name__=='__main__':main()
