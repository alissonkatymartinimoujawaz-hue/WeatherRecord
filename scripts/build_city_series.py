"""Expose each requested NASA point without hiding city differences in an index."""
import json,datetime as dt
from regions import ROOT,REGIONS,paths
from data_core import summarize,publish,write
catalog=[]
for region in REGIONS:
    folder,cache=paths(region)
    regional=json.loads((folder/'nasa_daily.json').read_text(encoding='utf-8'))
    stored=json.loads((cache/'nasa-daily-points.json').read_text(encoding='utf-8'))
    for i,point in enumerate(region['points']):
        identifier=region['id']+'-'+str(i)
        alias=regional.get('aliases',{}).get(point['name'],point['name'])
        values=stored[alias];rows=[];soil={}
        for row in regional['rows']:
            date=row[0];v=values.get(date,[None]*5)
            rows.append([date,*v[:4],'missing' if any(x is None for x in v[:4]) else 'nasa'])
            soil[date]=v[4]
        spec=dict(id=identifier,name=point['name'],points=[point])
        d=summarize(rows,spec,'NASA POWER individual requested point','LST',dt.date.fromisoformat(regional['as_of']),soil)
        d['updated_utc']=regional['updated_utc'];d['shared_grid_with']=alias if alias!=point['name'] else None
        publish(ROOT/'site/data/cities',identifier,d)
        catalog.append(dict(id=identifier,city=point['name'],region=region['id'],country=region['country'],path='data/cities/'+identifier+'.json',last_date=d['last_date'],shared_grid_with=d['shared_grid_with']))
write(ROOT/'site/data/cities/catalog.json',catalog)
print('Published nine individual city series; no new data requested.')
