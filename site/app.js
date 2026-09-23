'use strict';
const $=id=>document.getElementById(id),MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Stable, distinct colours for every year, shared across metrics and regions.
const yearColor=y=>d3.hsl(((y-1980)*137.507764)%360,.62,.38+((y-1980)%3)*.07).formatHex();
const fmt=(v,n=1)=>v==null?'—':Number(v).toLocaleString('en-GB',{minimumFractionDigits:n,maximumFractionDigits:n});
const datefmt=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const statusName=s=>({era5:'ERA5',era5_recent:'Recent ERA5 · subject to revision',ifs_provisional:'IFS · provisional',nasa:'NASA POWER',nasa_recent:'NASA POWER · recent, subject to revision',missing:'Missing data'}[s]||s);
let data,byDate,regions,region,view='daily',loadVersion=0;let state={period:7,year:null,compare:[],background:true,source:'nasa',region:'sul',frequency:'monthly',measure:'value',all:false};
try{Object.assign(state,JSON.parse(localStorage.getItem('weatherrecord-choices')||'{}'));}catch{}
state.source='nasa';
const save=()=>{try{localStorage.setItem('weatherrecord-choices',JSON.stringify(state));}catch{}};
function switchView(v){$('tooltip').hidden=true;view=v;if(!data)return;document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==v);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(data){if(v==='daily')renderDaily();if(v==='compare')renderCompare();}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
function plot(target,series,{daily=false,labels=[],unit='',rainBars=false,axis='Month',all=false,events=[]}={}){
 const el=$(target);if(!el||!el.clientWidth)return;el.replaceChildren();const w=el.clientWidth,h=310,m={l:57,r:14,t:12,b:55};
 const vals=series.flatMap(s=>s.points.filter(p=>p.y!==null&&Number.isFinite(p.y))),xs=vals.map(p=>p.x),ys=vals.map(p=>p.y);
 if(!vals.length){el.textContent='No complete data for this selection.';return;}
 if(daily){const bounds=d3.extent(xs),start=new Date(bounds[0]).toISOString().slice(0,10),end=new Date(bounds[1]).toISOString().slice(0,10);events=matchingEvidence(state.region,[{start,end}]).map(e=>({x:Date.parse((e.start<start?start:e.start)+'T00:00:00Z'),label:`${e.kind} · ${e.start} · ${e.scope}`}));}
 let [lo,hi]=d3.extent(ys);const pad=(hi-lo||1)*.09;lo-=pad;hi+=pad;if(rainBars)lo=Math.min(0,lo);
 const x=(daily?d3.scaleUtc():d3.scaleLinear()).domain(d3.extent(xs)).range([m.l+3,w-m.r-3]);const y=d3.scaleLinear().domain([lo,hi]).nice().range([h-m.b,m.t]);
 const svg=d3.select(el).append('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('width',w).attr('height',h).attr('role','img').attr('aria-label',el.closest('article').querySelector('h3').textContent+' ; '+unit);
 svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('x1',m.l).attr('x2',w-m.r).attr('y1',y).attr('y2',y).attr('stroke','#e7edf2');
 svg.append('g').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d=>fmt(d,unit==='fraction'?2:0)).tickSize(0)).selectAll('text').attr('dx',-5);
 let ax=d3.axisBottom(x).tickSize(0);
 if(daily)ax.ticks(w<430?3:5).tickFormat(d3.utcFormat('%d/%m'));else{let n=labels.length,step=n===12?(w<430?3:2):Math.ceil(n/(w<430?4:7));ax.tickValues(d3.range(0,n,step)).tickFormat(i=>labels[i]||'');}
 svg.append('g').attr('transform',`translate(0,${h-m.b+9})`).call(ax);
 svg.append('text').attr('x',(m.l+w-m.r)/2).attr('y',h-7).attr('text-anchor','middle').text(axis);
 svg.append('text').attr('x',m.l).attr('y',m.t-2).text(unit);
 const clip=target+'-clip';svg.append('defs').append('clipPath').attr('id',clip).append('rect').attr('x',m.l).attr('y',m.t).attr('width',w-m.l-m.r).attr('height',h-m.b-m.t);
 const layer=svg.append('g').attr('clip-path',`url(#${clip})`),line=d3.line().defined(p=>p.y!==null&&Number.isFinite(p.y)).x(p=>x(p.x)).y(p=>y(p.y));
 for(const s of series){
  if(s.bar){const bw=Math.max(1,(w-m.l-m.r)/s.points.length*.67);layer.selectAll('.bar').data(s.points.filter(p=>p.y!==null)).join('rect').attr('x',p=>x(p.x)-bw/2).attr('y',p=>y(p.y)).attr('width',bw).attr('height',p=>Math.max(0,y(0)-y(p.y))).attr('fill',s.color).attr('opacity',.83);}
  else{s.path=layer.append('path').datum(s.points).attr('data-series',s.name).attr('fill','none').attr('stroke',s.color).attr('stroke-width',s.width||1.8).attr('stroke-opacity',s.opacity??1).attr('stroke-dasharray',s.dash||null).attr('d',line);}
  if(s.markers)layer.selectAll('.dots-'+s.name.replaceAll('/','')).data(s.points.filter(p=>p.y!==null)).join('circle').attr('cx',p=>x(p.x)).attr('cy',p=>y(p.y)).attr('r',2.5).attr('fill',s.color);
 }
 const guide=svg.append('line').attr('y1',m.t).attr('y2',h-m.b).attr('stroke','#72879a').attr('stroke-dasharray','3 3').attr('visibility','hidden');
 const overlay=svg.append('rect').attr('x',m.l).attr('y',m.t).attr('width',w-m.l-m.r).attr('height',h-m.t-m.b).attr('fill','transparent');let pinned=false;
 function resetHighlight(){for(const s of series)if(s.path)s.path.attr('stroke-width',s.width||1.8).attr('stroke-opacity',s.opacity??1);}
 function show(event){const [px,py]=d3.pointer(event,svg.node()),tx=+x.invert(px);let candidates=series.filter(s=>!s.background);const rows=[];let at;
  if(target.startsWith('compare-')){
   let best=null,distance=Infinity;
   for(const s of series){
    let prev=null;
    for(const p of s.points){
     if(p.y===null||!Number.isFinite(p.y)){prev=null;continue;}
     const b=[x(p.x),y(p.y)];let dist=Math.hypot(px-b[0],py-b[1]);
     if(prev){const dx=b[0]-prev[0],dy=b[1]-prev[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((px-prev[0])*dx+(py-prev[1])*dy)/len)):0;dist=Math.min(dist,Math.hypot(px-prev[0]-t*dx,py-prev[1]-t*dy));}
     if(dist<distance){distance=dist;best=s;}prev=b;
    }
   }
   if(!best||distance>16){$('tooltip').hidden=true;guide.attr('visibility','hidden');resetHighlight();return;}
   candidates=[best];for(const s of series)if(s.path)s.path.attr('stroke-width',s===best?3.5:s.width||1.8).attr('stroke-opacity',s===best?1:.12);
   if(best.path)best.path.raise();
  }
  for(const s of candidates){const i=d3.bisector(p=>p.x).center(s.points,tx),p=s.points[i];if(p&&p.y!==null){at=p.x;rows.push({name:s.name,v:p.y,normal:s.normal});}}
  if(at===undefined){$('tooltip').hidden=true;return;}guide.attr('x1',x(at)).attr('x2',x(at)).attr('visibility','visible');
  const tip=$('tooltip');tip.hidden=false;tip.innerHTML=`<strong>${daily?datefmt(new Date(at).toISOString().slice(0,10)):labels[Math.round(at)]}</strong><div class="${rows.length>6?'tooltip-grid':''}">${rows.map(r=>`<div class="tip-row"><span>${r.name}</span><span>${fmt(r.v,unit==='fraction'?3:1)}</span></div>`).join('')}</div>`;
  const left=Math.min(window.innerWidth-tip.offsetWidth-12,Math.max(8,event.clientX+14));let top=event.clientY+16;if(top+tip.offsetHeight>window.innerHeight-8)top=Math.max(8,event.clientY-tip.offsetHeight-10);tip.style.left=left+'px';tip.style.top=top+'px';
 }
 // Event dates are annotations, never artificial temperature or rainfall values.
 for(const [i,e] of events.entries()){
  if(e.x<x.domain()[0]||e.x>x.domain()[1])continue;
  const a=svg.append('a').attr('href','#'+(target.startsWith('compare-')?'compare-evidence':'daily-evidence')).attr('aria-label',e.label);
  a.append('line').attr('x1',x(e.x)).attr('x2',x(e.x)).attr('y1',m.t+12).attr('y2',h-m.b).attr('stroke','#71849a').attr('stroke-dasharray','2 5').attr('opacity',.5).attr('pointer-events','none');
  a.append('circle').attr('cx',x(e.x)).attr('cy',m.t+5+(i%2)*12).attr('r',5).attr('fill','#102b43');a.append('title').text(e.label);
 }
 overlay.on('pointermove',e=>{if(!pinned)show(e);}).on('pointerleave',()=>{if(!pinned){$('tooltip').hidden=true;guide.attr('visibility','hidden');resetHighlight();}}).on('click',e=>{pinned=!pinned;show(e);if(!pinned){$('tooltip').hidden=true;guide.attr('visibility','hidden');resetHighlight();}});
}
function renderDaily(){
 const date=$('date').value||data.last_date,idx=data.rows.findIndex(r=>r[0]===date),row=data.rows[idx];if(!row)return;
 const norm=data.daily_normal[date.slice(5)];
 $('metrics').innerHTML=[['Rainfall',row[1],'mm',norm?.[0]],['Mean temperature',row[2],'°C',norm?.[1]],['Minimum temperature',row[3],'°C',norm?.[2]],['Maximum temperature',row[4],'°C',norm?.[3]]].map((a,i)=>`<div class="metric ${i?'temp':''}"><span>${a[0]}</span><strong>${fmt(a[1])} <span>${a[2]}</span></strong><small>Daily normal: ${fmt(a[3])} ${a[2]}</small></div>`).join('');
 $('coverage').textContent=datefmt(date)+' · '+region.name;$('daily-status').textContent=statusName(row[5])+' · complete days only. Recent data may be revised; no values for the current day.';
 const rs=data.rows.slice(Math.max(0,idx-Number($('window').value)+1),idx+1),point=(r,j)=>({x:Date.parse(r[0]+'T00:00:00Z'),y:r[j]});
 plot('daily-rain',[{name:'Rainfall',color:'#007f87',bar:true,points:rs.map(r=>point(r,1))},{name:'Normal',color:'#223c52',dash:'5 4',points:rs.map(r=>({x:Date.parse(r[0]+'T00:00:00Z'),y:data.daily_normal[r[0].slice(5)]?.[0]??null}))}],{daily:true,rainBars:true,unit:'mm',axis:data.timezone==='LST'?'Date · local solar time':'Date · America/Sao_Paulo'});
 plot('daily-temp',[...[[2,'Tmean','#c76b20'],[3,'Tmin','#4279bd'],[4,'Tmax','#b74351']].map(([j,name,color])=>({name,color,points:rs.map(r=>point(r,j))})),{name:'Tmean normal',color:'#223c52',dash:'5 4',points:rs.map(r=>({x:Date.parse(r[0]+'T00:00:00Z'),y:data.daily_normal[r[0].slice(5)]?.[1]??null}))}],{daily:true,unit:'°C',axis:data.timezone==='LST'?'Date · local solar time':'Date · America/Sao_Paulo'});
 $('daily-soil-article').hidden=!data.soil_daily;
 if(data.soil_daily)plot('daily-soil',[{name:'Root-zone wetness',color:'#268750',points:rs.map(r=>({x:Date.parse(r[0]+'T00:00:00Z'),y:data.soil_daily[r[0]]??null}))},{name:'Normal',color:'#223c52',dash:'5 4',points:rs.map(r=>({x:Date.parse(r[0]+'T00:00:00Z'),y:data.soil_daily_normal[r[0].slice(5)]??null}))}],{daily:true,unit:'fraction',axis:'Date · local solar time'});
 renderEvidence('daily-evidence',[{start:rs[0][0],end:date}]);
 $('daily-table').innerHTML=[...rs].reverse().map(r=>`<tr><td>${datefmt(r[0])}</td>${r.slice(1,5).map(v=>`<td>${fmt(v)}</td>`).join('')}<td>${fmt(data.soil_daily?.[r[0]],3)}</td><td>${statusName(r[5])}</td></tr>`).join('');
}
function yearLabel(y){return state.period===1?String(y):`${y}/${String(y+1).slice(-2)}`;}
function selectedYears(years){return state.all?years:[state.year,...state.compare].filter((y,i,a)=>years.includes(y)&&a.indexOf(y)===i);}
const dailyValue=(date,j)=>j===4?data.soil_daily?.[date]??null:byDate.get(date)?.[j+1]??null;
const dailyNormal=(md,j)=>j===4?data.soil_daily_normal?.[md]??null:data.daily_normal[md]?.[j]??null;
function renderCompare(){
 const ns=state.source==='nasa',src=data;$('tooltip').hidden=true;
 const first=1981-(state.period===1?0:1),lastDate=ns?src.last_date:data.last_date,ly=Number(lastDate.slice(0,4))-(Number(lastDate.slice(5,7))<state.period?1:0),years=d3.range(first,ly+1);
 if(!years.includes(state.year))state.year=ly;state.compare=state.compare.filter(y=>years.includes(y)&&y!==state.year);
 ['period','frequency','measure'].forEach(k=>$(k).value=String(state[k]));$('frequency').disabled=false;$('background').checked=state.background&&!state.all;$('background').disabled=state.all;$('all-years').setAttribute('aria-pressed',String(state.all));
 $('year').innerHTML=years.slice().reverse().map(y=>`<option value="${y}">${yearLabel(y)}${y===ly?' · latest':''}</option>`).join('');$('year').value=state.year;
 $('year-buttons').innerHTML=years.slice().reverse().map(y=>`<button data-year="${y}" class="${state.compare.includes(y)?'selected':''}" aria-pressed="${state.compare.includes(y)}">${yearLabel(y)}</button>`).join('');
 $('year-buttons').querySelectorAll('button').forEach(b=>b.onclick=()=>{let y=+b.dataset.year;state.all=false;if(y!==state.year)state.compare=state.compare.includes(y)?state.compare.filter(v=>v!==y):[...state.compare,y];save();renderCompare();});
 const act=selectedYears(years),color=yearColor;
 $('selected-legend').innerHTML='<span class="normal-key">1991–2020 normal</span>'+(state.all?'<span>All years</span>':act.map(y=>`<span style="--key:${color(y)}">${yearLabel(y)}${y===state.year?' · focus':''}</span>`).join(''))+(state.background&&!state.all?'<span>Other years in grey</span>':'');
 $('compare-note').textContent=`${region.name} · ${ns?'NASA POWER':'ERA5 archive'} · latest day: ${datefmt(src.last_date)}. Source-specific 1991–2020 normal. Hover over a curve to see only that year; click to pin. Missing days remain blank.`;
 const monthly=state.frequency==='monthly',cumulative=state.frequency==='cumulative',an=state.measure==='anomaly';
 const dims=cumulative?[['Cumulative rainfall',0,'mm']]:[['Rainfall',0,'mm'],['Mean temperature',1,'°C'],[monthly?'Average daily minimum':'Daily minimum temperature',2,'°C'],[monthly?'Average daily maximum':'Daily maximum temperature',3,'°C'],...(ns?[['Root-zone wetness',4,'fraction']]:[])];
 $('comparison-charts').innerHTML=dims.map(([name,j,unit])=>`<article><div class="chart-heading"><h3>${name}${an?' · anomaly':''}</h3><span>${unit}</span></div><div class="plot" id="compare-${j}"></div></article>`).join('');
 const order=d3.range(12).map(i=>(i+state.period-1)%12+1),calendarDays=[];
 order.forEach(m=>{const days=new Date(Date.UTC(2000,m,0)).getUTCDate();for(let d=1;d<=days;d++)calendarDays.push([m,d]);});
 const labels=monthly?order.map(m=>MONTHS[m-1]):calendarDays.map(([m,d])=>`${d} ${MONTHS[m-1]}`),monMap=new Map(src.monthly.map(r=>[r[0],[r[0],...r.slice(1,5),src.soil_monthly?.[r[0]]??null]]));
 const monthNormals=src.normal.map((r,i)=>[...r,src.soil_normal?.[i]??null]);
 // When the latest year is visible, compare the unfinished month over identical days.
 const [currentYear,currentMonth,currentDay]=data.last_date.split('-').map(Number);
 if(monthly&&act.includes(ly)&&currentDay<new Date(Date.UTC(currentYear,currentMonth,0)).getUTCDate()){
  const mm=String(currentMonth).padStart(2,'0');
  for(let yy=1981;yy<=currentYear;yy++){
   const rs=Array.from({length:currentDay},(_,i)=>byDate.get(`${yy}-${mm}-${String(i+1).padStart(2,'0')}`));
   const values=[0,1,2,3,4].map(j=>{const vs=rs.map(r=>r?dailyValue(r[0],j):null);return vs.every(v=>v!==null)?vs.reduce((a,b)=>a+b,0)/(j===0?1:currentDay):null;});
   monMap.set(`${yy}-${mm}`,[`${yy}-${mm}`,...values]);
  }
  monthNormals[currentMonth-1]=[0,1,2,3,4].map(j=>{const vs=Array.from({length:currentDay},(_,i)=>dailyNormal(`${mm}-${String(i+1).padStart(2,'0')}`,j));return vs.every(v=>v!==null)?vs.reduce((a,b)=>a+b,0)/(j===0?1:currentDay):null;});
  labels[order.indexOf(currentMonth)]=`${MONTHS[currentMonth-1]} 1–${currentDay}`;
  $('compare-note').textContent=`Current month: ${MONTHS[currentMonth-1]}, days 1–${currentDay} only, for all years and the normal. No full-month total is estimated. ${region.name} · ${ns?'NASA POWER':'ERA5 archive'}. Hover over a curve to see its year.`;
 }
 for(const [name,j,unit] of dims){
  const series=[];
  for(const yy of years.filter(y=>state.background||act.includes(y))){let sum=0,nsum=0,broken=false;
   const points=monthly?order.map((m,i)=>{let year=yy+(m<state.period?1:0),key=`${year}-${String(m).padStart(2,'0')}`,r=monMap.get(key),v=r?.[j+1]??null;return{x:i,y:v===null?null:v-(an?monthNormals[m-1][j]:0)};}):calendarDays.map(([m,d],i)=>{
    let year=yy+(m<state.period?1:0),date=`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(d>new Date(Date.UTC(year,m,0)).getUTCDate())return{x:i,y:null};
    const v=dailyValue(date,j),n=dailyNormal(date.slice(5),j);
    if(cumulative){if(v===null||n===null)broken=true;if(broken)return{x:i,y:null};sum+=v;nsum+=n;return{x:i,y:sum-(an?nsum:0)};}
    return{x:i,y:v===null||n===null?null:v-(an?n:0)};
   });
   const chosen=act.includes(yy);series.push({name:yearLabel(yy),points,color:chosen?color(yy):'#9bacba',background:!chosen,opacity:state.all?.72:chosen?1:.24,width:yy===state.year&&!state.all?3:chosen?1.8:1,markers:monthly&&chosen&&!state.all});
  }
  series.sort((a,b)=>Number(!a.background)-Number(!b.background));
  let total=0;
  const np=monthly?order.map((m,i)=>({x:i,y:an?0:monthNormals[m-1][j]})):calendarDays.map(([m,d],i)=>{let year=state.year+(m<state.period?1:0);if(d>new Date(Date.UTC(year,m,0)).getUTCDate())return{x:i,y:null};let v=dailyNormal(`${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,j);if(cumulative&&v!==null)total+=v;return{x:i,y:an?0:cumulative?total:v};});
  series.push({name:'Normal',points:np,color:'#203b50',width:2.2,dash:'6 4',normal:true});
  plot('compare-'+j,series,{labels,unit,axis:monthly?'Month of the selected year':'Day of the selected year',all:state.all,events:eventMarkers(act,state.period,monthly,calendarDays)});
 }
 renderEvidence('compare-evidence',evidenceWindows(act,state.period));
}
['period','year','frequency','measure','background'].forEach(k=>$(k).onchange=e=>{state[k]=k==='background'?e.target.checked:['year','period'].includes(k)?Number(e.target.value):e.target.value;if(k==='year')state.all=false;save();renderCompare();});
$('inspect-cold').onclick=()=>{state.period=1;state.year=2021;state.compare=[];state.frequency='daily';state.measure='anomaly';state.all=false;state.background=false;save();renderCompare();};
$('all-years').onclick=()=>{state.all=true;state.background=true;save();renderCompare();};$('date').onchange=renderDaily;$('window').onchange=renderDaily;
async function loadRegion(){
 const version=++loadVersion;$('tooltip').hidden=true;$('error').hidden=true;data=null;
 document.querySelectorAll('.view').forEach(e=>e.hidden=true);$('freshness').textContent='Loading data…';
 const nextRegion=regions.find(r=>r.id===state.region)||regions[0];state.region=nextRegion.id;
 if(state.region!=='sul')state.source='nasa';
 $('source').value=state.source;$('source').querySelector('[value="era5"]').disabled=state.region!=='sul';
 $('region').value=state.region;save();
 const folder='data/'+(state.region==='sul'?'':state.region+'/'),file=state.source==='nasa'?'nasa_daily':'era5_archive';
 try{
  const res=await fetch(folder+file+'.json',{cache:'no-cache'});if(!res.ok)throw Error('Data are not available for this selection.');
  const payload=await res.json();if(version!==loadVersion)return;
  if(payload.region_id!==nextRegion.id)throw Error('Geographic identifier mismatch.');
  region=nextRegion;data=payload;byDate=new Map(data.rows.map(r=>[r[0],r]));
  $('date').min=data.rows[0][0];$('date').max=data.last_date;$('date').value=data.last_date;
  const age=(Date.now()-Date.parse(data.updated_utc))/86400000,ns=state.source==='nasa';
  $('freshness').innerHTML=`${ns?'NASA POWER · daily updates':'ERA5 · archive, no automatic updates'}<br>Latest day: ${datefmt(data.last_date)}<br>Retrieved: ${new Date(data.updated_utc).toLocaleString('en-GB',{timeZone:'Europe/London',dateStyle:'short',timeStyle:'short'})} · London${ns&&age>2?'<br>Update overdue':''}`;
  $('brand-region').textContent=region.name+' · '+(region.country||'Brazil').toUpperCase();$('region-scope').textContent=region.scope;
  $('points').innerHTML=data.points.map(p=>`<tr><td><a href="${p.coord_source||'#'}" target="_blank" rel="noopener">${p.name}</a></td><td>${p.latitude}</td><td>${p.longitude}</td></tr>`).join('');
  $('selection-note').textContent=region.selection_note||'Four equally weighted points. Boa Esperança and Guapé share the same MERRA-2 grid cell, which therefore accounts for 50% of this index.';
  $('download-values').href=folder+file+'.csv';$('download-provenance').href=folder+(ns?'nasa_provenance.json':'provenance.json');
  $('download-data').href=folder+file+'.json';$('download-audit').href=folder+'audit.json';
  switchView(view);
 }catch(e){if(version!==loadVersion)return;$('error').hidden=false;$('error').textContent=e.message;$('freshness').textContent='Data unavailable';}
}
async function init(){try{
 if(!window.d3)throw Error('The chart library could not be loaded. Refresh the page.');
 const res=await fetch('data/regions.json',{cache:'no-cache'});if(!res.ok)throw Error('Regions unavailable');regions=await res.json();
 function populateRegions(country){$('region').innerHTML=regions.filter(r=>(r.country||'Brazil')===country).map(r=>`<option value="${r.id}">${r.name}</option>`).join('');}
 $('country').value=(regions.find(r=>r.id===state.region)?.country)||'Brazil';populateRegions($('country').value);
 $('country').onchange=e=>{populateRegions(e.target.value);state.region=$('region').value;state.period=e.target.value==='Vietnam'?10:7;state.year=null;state.compare=[];save();loadRegion();};
 $('region').onchange=e=>{state.region=e.target.value;loadRegion();};$('source').onchange=e=>{state.source=e.target.value;loadRegion();};await loadRegion();
 }catch(e){$('error').hidden=false;$('error').textContent=e.message;}}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data)switchView(view);},150);});init();
