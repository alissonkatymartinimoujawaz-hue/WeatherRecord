"""NASA POWER official daily data, retained per point and never mixed with ERA5."""
import argparse,datetime as dt,json,time,urllib.request,urllib.parse
from regions import REGIONS,paths
from data_core import write,archive,finite,summarize,publish
KEYS=['PRECTOTCORR','T2M','T2M_MIN','T2M_MAX','GWETROOT']
def fetch(point,start,end,folder):
 q=dict(parameters=','.join(KEYS),community='AG',latitude=point['latitude'],longitude=point['longitude'],start=start.strftime('%Y%m%d'),end=end.strftime('%Y%m%d'),format='JSON',**{'time-standard':'LST'})
 url='https://power.larc.nasa.gov/api/temporal/daily/point?'+urllib.parse.urlencode(q)
 for attempt in range(4):
  try:
   with urllib.request.urlopen(url,timeout=180) as r:raw=r.read()
   p=json.loads(raw);pars=p['properties']['parameter'];fill=p['header'].get('fill_value',-999)
   coords=p['geometry']['coordinates']
   if abs(coords[0]-point['longitude'])>.001 or abs(coords[1]-point['latitude'])>.001:raise ValueError('NASA point mismatch')
   if p['header'].get('time_standard')!='LST':raise ValueError('NASA time standard mismatch')
   if any(p['parameters'][k]['units']!=u for k,u in zip(KEYS,['mm/day','C','C','C','1'])):raise ValueError('NASA units mismatch')
   expected={(start+dt.timedelta(days=i)).strftime('%Y%m%d') for i in range((end-start).days+1)}
   if any(set(pars[k])!=expected for k in KEYS):raise ValueError('NASA dates mismatch')
   rows={}
   for day in sorted(expected):
    vals=[pars[k][day] if finite(pars[k][day]) and pars[k][day]!=fill else None for k in KEYS]
    if vals[0] is not None and vals[0]<0:raise ValueError('Negative precipitation')
    if all(v is not None for v in vals[1:4]) and not vals[2]<=vals[1]<=vals[3]:raise ValueError('Temperature ordering')
    if vals[4] is not None and not 0<=vals[4]<=1:raise ValueError('Root-zone wetness out of bounds')
    rows[f'{day[:4]}-{day[4:6]}-{day[6:]}']=vals
   sha,path=archive(raw,folder)
   return rows,dict(point=point['name'],url=url,sha256=sha,raw_path=path,retrieved_utc=dt.datetime.now(dt.timezone.utc).isoformat(),header=p['header'],parameters=p['parameters'],geometry=p['geometry'])
  except Exception as e:
   print('NASA attempt failed',type(e).__name__,str(e)[:150],flush=True)
   if attempt==3:raise
   time.sleep(10*(attempt+1))
def update(region,today):
 folder,cache=paths(region);file=cache/'nasa-daily-points.json';old=json.loads(file.read_text(encoding='utf-8')) if file.exists() else {};mf=cache/'nasa-daily-requests.json';manifest=json.loads(mf.read_text(encoding='utf-8')) if mf.exists() else []
 yesterday=today-dt.timedelta(days=1)
 # These two requested points share a MERRA-2 cell, previously checked against NASA responses.
 aliases={'Guapé':'Boa Esperança'} if region['id']=='sul' else {}
 for point in region['points']:
  name=point['name']
  if name in aliases:continue
  history=old.setdefault(name,{})
  start=max(dt.date(1981,1,1),dt.date.fromisoformat(max(history))-dt.timedelta(days=100)) if history else dt.date(1981,1,1)
  while start<=yesterday:
   end=min(dt.date(start.year+9,12,31),yesterday);print(region['id'],name,'NASA daily',start,end,flush=True)
   batch,meta=fetch(point,start,end,folder)
   history.update(batch)
   manifest.append(meta);write(file,old);write(mf,manifest);start=end+dt.timedelta(days=1)
 dates=[str(dt.date(1981,1,1)+dt.timedelta(days=i)) for i in range((yesterday-dt.date(1981,1,1)).days+1)]
 rows=[];soil={};n=len(region['points'])
 for day in dates:
  pp=[old[aliases.get(p['name'],p['name'])].get(day,[None]*5) for p in region['points']]
  vals=[round(sum(v[j] for v in pp)/n,6) if all(v[j] is not None for v in pp) else None for j in range(5)]
  status='missing' if any(v is None for v in vals[:4]) else 'nasa_recent' if day>str(today-dt.timedelta(days=95)) else 'nasa'
  rows.append([day]+vals[:4]+[status]);soil[day]=vals[4]
 p=summarize(rows,region,'NASA POWER / MERRA-2 daily','LST',today,soil);p['grid_resolution']='0.5° latitude × 0.625° longitude';p['aliases']=aliases
 publish(folder,'nasa_daily',p);write(folder/'nasa_provenance.json',dict(region_id=region['id'],points=region['points'],aliases=aliases,weights=[1/n]*n,requests=manifest,baseline='1991–2020',daily_parameters=KEYS,aggregation='All configured points per variable, equal weights. Missing values stay null.',source='https://power.larc.nasa.gov/docs/services/api/temporal/daily/'))
 print(region['id'],'NASA complete through',p['last_date'],flush=True)
def main():
 a=argparse.ArgumentParser();a.add_argument('--region',choices=[r['id'] for r in REGIONS]);args=a.parse_args();today=dt.datetime.now(dt.timezone.utc).date()
 for r in REGIONS:
  if not args.region or r['id']==args.region:update(r,today)
if __name__=='__main__':main()
