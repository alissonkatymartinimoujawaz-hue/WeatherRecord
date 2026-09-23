'use strict';
let stationCatalog,cityCatalog,stationCity,stationPayload,cityPayload,stationVersion=0;
const stationCache=new Map();
async function stationFetch(url){if(!stationCache.has(url)){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error('Unavailable: '+url);stationCache.set(url,await r.json());}return stationCache.get(url);}
async function renderStationReview(){
 if(cityPayload){drawStationReview();return;}
 try{
  if(!stationCatalog){
   [stationCatalog,cityCatalog]=await Promise.all([stationFetch('data/stations/catalog.json'),stationFetch('data/cities/catalog.json')]);
   $('station-city').innerHTML=cityCatalog.map(c=>`<option value="${c.id}">${weatherEscape(c.city)} · ${c.country}</option>`).join('');
   $('station-year').innerHTML=Array.from({length:46},(_,i)=>2026-i).map(y=>`<option>${y}</option>`).join('');$('station-year').value='2021';
   $('station-city').onchange=()=>loadStationCity();$('station-choice').onchange=()=>loadStationCity(true);
   ['station-year','station-frequency'].forEach(id=>$(id).onchange=drawStationReview);
   $('station-inventory').innerHTML=stationCatalog.cities.map(c=>{const s=stationCatalog.stations.find(s=>s.id===c.default_station),choice=c.station_choices?.find(v=>v.id===c.default_station);return `<tr><td>${weatherEscape(c.city)}</td><td>${s?weatherEscape(s.name)+' · '+s.id:'No verified local series'}</td><td>${choice?fmt(choice.distance_km)+' km':'—'}</td><td>${s?fmt(s.elevation_m,0)+' m':'—'}</td><td>${s?s.first+' → '+s.last:'—'}</td><td>${!s?'Coastal substitute rejected':choice.distance_km>50?'Distant station: context only':'Station is a point, not a regional average'}</td></tr>`;}).join('');
  }
  await loadStationCity();
 }catch(e){$('station-summary').textContent=e.message;}
}
async function loadStationCity(keep=false){
 const version=++stationVersion;stationCity=cityCatalog.find(c=>c.id===$('station-city').value);const item=stationCatalog.cities.find(c=>c.city===stationCity.city);
 if(!keep){$('station-choice').innerHTML=(item.station_choices||[]).map(c=>{const s=stationCatalog.stations.find(s=>s.id===c.id);return `<option value="${s.id}">${weatherEscape(s.name)} · ${s.id} · ${fmt(c.distance_km)} km · ${s.source.startsWith('INMET')?'INMET':'NOAA GSOD'}</option>`;}).join('')||'<option value="">No verified local station</option>';$('station-choice').value=item.default_station||'';}
 $('station-summary').textContent='Loading verified source files…';
 try{
  const sid=$('station-choice').value;
  const [city,station]=await Promise.all([stationFetch(stationCity.path),sid?stationFetch('data/stations/'+sid+'.json'):null]);
  if(version!==stationVersion)return;cityPayload=city;stationPayload=station;drawStationReview();
 }catch(e){if(version===stationVersion)$('station-summary').textContent=e.message;}
}
function drawStationReview(){
 if(!cityPayload)return;
 const year=Number($('station-year').value),monthly=$('station-frequency').value==='monthly',item=stationCatalog.cities.find(c=>c.city===stationCity.city),choice=item.station_choices?.find(c=>c.id===stationPayload?.id);
 const esc=weatherEscape,station=stationPayload;
 $('brand-region').textContent=stationCity.city+' · '+stationCity.country.toUpperCase();
 $('freshness').innerHTML=(station?esc(station.source)+'<br>Station archive: '+esc(station.rows.at(-1)?.[0]||'none'):'No verified local station')+'<br>NASA city grid: '+esc(cityPayload.last_date);
 $('station-summary').innerHTML=`<strong>${esc(stationCity.city)}</strong> · ${station?esc(station.name)+' ('+station.id+'), '+fmt(choice.distance_km)+' km from the city point, '+fmt(station.elevation_m,0)+' m altitude.':'No verified local station integrated. NASA remains a gridded estimate.'}<br>${station?esc(station.time_note)+'<br>Archive retrieved '+esc(station.retrieved_utc.slice(0,10))+'. Last record '+esc(station.last||station.rows.at(-1)?.[0]||'none')+'. This station archive is separate from the daily NASA update.':''}${choice?.distance_km>50?'<br><strong>Distant station: regional context only. It does not measure this city or its farms.</strong>':''}${cityPayload.shared_grid_with?'<br>NASA shares this grid cell with '+esc(cityPayload.shared_grid_with)+'. The two city curves are not independent measurements.':''}`;
 const start=Date.UTC(year,0,1),days=(Date.UTC(year+1,0,1)-start)/86400000,dates=Array.from({length:days},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
 const nasa=new Map(cityPayload.rows.map(r=>[r[0],r])),obs=new Map((station?.rows||[]).map(r=>[r[0],r]));
 const nm=new Map(cityPayload.monthly.map(r=>[r[0],r])),sm=new Map((station?.monthly||[]).map(r=>[r[0],r]));
 const labels=monthly?MONTHS:dates;
 $('station-charts').innerHTML=[['Rainfall','mm'],['Mean temperature','°C'],['Minimum temperature','°C'],['Maximum temperature','°C']].map(([name,unit],i)=>`<article><h3>${monthly&&i>1?'Average daily '+(i===2?'minimum':'maximum'):name}</h3><div id="station-plot-${i}" class="plot"></div><p class="legend"><span style="--key:#b35b10;color:#b35b10">● Station</span><span style="--key:#007f87;color:#007f87">● NASA city grid</span>${i>1?'<span style="--key:#8b3ba0;color:#8b3ba0">● Partial-day station extreme</span>':''}</p></article>`).join('');
 for(let j=1;j<=4;j++){
  const points=map=>monthly?MONTHS.map((_,m)=>({x:m,y:map.get(`${year}-${String(m+1).padStart(2,'0')}`)?.[j]??null})):dates.map((date,i)=>({x:i,y:map.get(date)?.[j]??null}));
  const ss=[{name:'NASA city grid',color:'#007f87',points:points(monthly?nm:nasa),width:1.6}];
  if(station)ss.push({name:station.id+' station',color:'#b35b10',points:points(monthly?sm:obs),width:2});
  if(station?.partial_extremes&&!monthly&&j>=3){const partial=new Map(station.partial_extremes.map(r=>[r[0],r]));ss.push({name:'Partial-day observed '+(j===3?'Tmin':'Tmax'),color:'#8b3ba0',dotsOnly:true,markers:true,points:dates.map((date,i)=>{const r=partial.get(date);return {x:i,y:r&&r[j]>0&&r[j]<24?r[j-2]:null};})});}
  plot('station-plot-'+(j-1),ss,{labels,unit:j===1?'mm':'°C',axis:monthly?'Calendar month · full months only':'Calendar date · source-specific day boundaries'});
 }
 const selected=dates.map(d=>obs.get(d)),complete=j=>selected.filter(r=>r&&Number.isFinite(r[j]));
 const low=complete(3).reduce((a,r)=>!a||r[3]<a[3]?r:a,null),high=complete(4).reduce((a,r)=>!a||r[4]>a[4]?r:a,null);
 $('station-quality').innerHTML=`<div class="metric"><span>Station Tmin coverage</span><strong>${complete(3).length}<small> / ${days} days</small></strong></div><div class="metric"><span>Lowest complete-day Tmin</span><strong>${fmt(low?.[3])} °C</strong><small>${low?.[0]||'Unavailable'}${low?.[5]==='*'?' · sampled-hour estimate':''}</small></div><div class="metric"><span>Highest complete-day Tmax</span><strong>${fmt(high?.[4])} °C</strong><small>${high?.[0]||'Unavailable'}</small></div><div class="metric"><span>Complete rainfall days</span><strong>${complete(1).length}<small> / ${days}</small></strong></div>`;
 $('station-months').innerHTML=MONTHS.map((m,i)=>{const key=`${year}-${String(i+1).padStart(2,'0')}`,r=sm.get(key),n=new Date(Date.UTC(year,i+1,0)).getUTCDate();return `<tr><td>${key}</td><td>${r?.[5]||0}/${n}</td><td>${fmt(r?.[1])}</td><td>${r?.[7]||0}/${n}</td><td>${fmt(r?.[3])}</td><td>${r?.[8]||0}/${n}</td><td>${fmt(r?.[4])}</td></tr>`;}).join('');
 $('station-downloads').innerHTML=`<a href="${stationCity.path}" download>NASA city values and normals</a>${station?` · <a href="data/stations/${station.id}.json" download>Station values, coverage and source archive references</a>`:''}`;
 const events=matchingEvidence(stationCity.region,[{start:`${year}-01-01`,end:`${year}-12-31`}]);
 $('station-events').innerHTML='<h2>Reports to cross-check against the observations</h2><p>Reports describe their stated geographic scope, not necessarily the selected station. No report does not prove that no event occurred.</p>'+ (events.length?events.map(e=>`<details class="event-card"><summary>${esc(e.start)} · ${esc(e.title)}</summary><p>${esc(e.scope)}. ${esc(e.summary)}</p><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source)}</a></details>`).join(''):'<p>No reviewed report for this region and calendar year.</p>');
 $('station-rules').textContent=station?station.rain_rule+' '+station.extreme_rule+' Purple dots show extrema from incomplete days; they are not full-day extrema and are excluded from monthly means. No station anomaly is shown without a defensible station normal. NASA normals are not substituted.':'No station values, station normal or bias correction invented. The nearest NOAA candidate, Phan Thiet, is coastal and is not used as a highland substitute.';
}
