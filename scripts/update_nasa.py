"""Monthly NASA comparison, independent of the daily ERA5 series."""
import json,datetime as dt,pathlib,urllib.request,urllib.parse,hashlib
from update_weather import ROOT,POINTS,write
KEYS=['PRECTOTCORR_SUM','T2M','T2M_MIN_AVG','T2M_MAX_AVG','GWETROOT']
def main():
 today=dt.datetime.now(dt.timezone.utc).date();cache=ROOT/'cache'/'nasa-monthly.json';old=json.loads(cache.read_text()) if cache.exists() else {p['name']:{} for p in POINTS};requests=[]
 start=today.year-1 if all(old.values()) else 1981
 for p in POINTS:
  q=dict(parameters=','.join(KEYS),community='AG',latitude=p['latitude'],longitude=p['longitude'],start=start,end=today.year,format='JSON');url='https://power.larc.nasa.gov/api/temporal/monthly/point?'+urllib.parse.urlencode(q)
  with urllib.request.urlopen(url,timeout=120) as r:raw=r.read()
  res=json.loads(raw);pars=res['properties']['parameter'];requests.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'header':res['header'],'parameters':res['parameters']})
  for k in pars['T2M']:
   if not 1<=int(k[4:])<=12:continue
   vals=[pars[v].get(k) for v in KEYS]
   if all(v is not None and v!=-999 for v in vals):old[p['name']][k]=vals
 monthly=[]
 for k in sorted(set().union(*(p.keys() for p in old.values()))):
  vals=[old[p['name']].get(k) for p in POINTS]
  if all(v is not None for v in vals):monthly.append([k[:4]+'-'+k[4:]]+[round(sum(v[j] for v in vals)/4,6) for j in range(5)]+[True,False])
 normal=[]
 for m in range(1,13):
  rs=[r for r in monthly if 1991<=int(r[0][:4])<=2020 and int(r[0][5:])==m]
  if len(rs)!=30:raise ValueError('Incomplete NASA reference')
  normal.append([sum(r[j] for r in rs)/30 for j in range(1,6)])
 write(cache,old);write(ROOT/'site'/'data'/'nasa.json',{'monthly':monthly,'normal':normal,'last_date':monthly[-1][0]+'-01','updated_utc':dt.datetime.now(dt.timezone.utc).isoformat(),'source':'NASA POWER / MERRA-2, monthly; no recent daily extension','requests':requests,'units_note':'PRECTOTCORR_SUM is a monthly accumulation in mm; NASA metadata incorrectly label mm/day. Verified against daily sums in the audit.'})
 print('NASA updated through',monthly[-1][0])
if __name__=='__main__':main()
