'use strict';
const $=id=>document.getElementById(id),MONTHS=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
const COLORS=['#007f87','#c76b20','#5c68b5','#b74351','#268750','#8b5b42'];
const fmt=(v,n=1)=>v==null?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:n,maximumFractionDigits:n});
const datefmt=s=>new Date(s+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const statusName=s=>({era5:'ERA5',era5_recent:'ERA5 récent · révisable',ifs_provisional:'IFS · provisoire',missing:'Données absentes'}[s]||s);
let data,nasa,byDate,view='daily';let state={period:7,year:null,compare:[],background:true,source:'era5',frequency:'monthly',measure:'value',all:false};
try{Object.assign(state,JSON.parse(localStorage.getItem('weatherrecord-choices')||'{}'));}catch{}
const save=()=>{try{localStorage.setItem('weatherrecord-choices',JSON.stringify(state));}catch{}};
function switchView(v){view=v;document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==v);document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(data){if(v==='daily')renderDaily();if(v==='compare')renderCompare();}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
function plot(target,series,{daily=false,labels=[],unit='',rainBars=false,axis='Mois',all=false}={}){
 const el=$(target);if(!el||!el.clientWidth)return;el.replaceChildren();const w=el.clientWidth,h=310,m={l:57,r:14,t:12,b:55};
 const vals=series.flatMap(s=>s.points.filter(p=>p.y!==null&&Number.isFinite(p.y))),xs=vals.map(p=>p.x),ys=vals.map(p=>p.y);
 if(!vals.length){el.textContent='Aucune donnée complète pour cette sélection.';return;}
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
  else{layer.append('path').datum(s.points).attr('fill','none').attr('stroke',s.color).attr('stroke-width',s.width||1.8).attr('stroke-opacity',s.opacity??1).attr('stroke-dasharray',s.dash||null).attr('d',line);}
  if(s.markers)layer.selectAll('.dots-'+s.name.replaceAll('/','')).data(s.points.filter(p=>p.y!==null)).join('circle').attr('cx',p=>x(p.x)).attr('cy',p=>y(p.y)).attr('r',2.5).attr('fill',s.color);
 }
 const guide=svg.append('line').attr('y1',m.t).attr('y2',h-m.b).attr('stroke','#72879a').attr('stroke-dasharray','3 3').attr('visibility','hidden');
 const overlay=svg.append('rect').attr('x',m.l).attr('y',m.t).attr('width',w-m.l-m.r).attr('height',h-m.t-m.b).attr('fill','transparent');let pinned=false;
 function show(event){const px=d3.pointer(event,svg.node())[0],tx=+x.invert(px),candidates=series.filter(s=>!s.background),rows=[];let at;
  for(const s of candidates){const i=d3.bisector(p=>p.x).center(s.points,tx),p=s.points[i];if(p&&p.y!==null){at=p.x;rows.push({name:s.name,v:p.y,normal:s.normal});}}
  if(at===undefined)return;guide.attr('x1',x(at)).attr('x2',x(at)).attr('visibility','visible');
  const tip=$('tooltip');tip.hidden=false;tip.innerHTML=`<strong>${daily?datefmt(new Date(at).toISOString().slice(0,10)):labels[Math.round(at)]}</strong><div class="${rows.length>6?'tooltip-grid':''}">${rows.map(r=>`<div class="tip-row"><span>${r.name}</span><span>${fmt(r.v,unit==='fraction'?3:1)}</span></div>`).join('')}</div>`;
  const left=Math.min(window.innerWidth-tip.offsetWidth-12,Math.max(8,event.clientX+14));let top=event.clientY+16;if(top+tip.offsetHeight>window.innerHeight-8)top=Math.max(8,event.clientY-tip.offsetHeight-10);tip.style.left=left+'px';tip.style.top=top+'px';
 }
 overlay.on('pointermove',e=>{if(!pinned)show(e);}).on('pointerleave',()=>{if(!pinned){$('tooltip').hidden=true;guide.attr('visibility','hidden');}}).on('click',e=>{pinned=!pinned;show(e);if(!pinned){$('tooltip').hidden=true;guide.attr('visibility','hidden');}});
}
function renderDaily(){
 const date=$('date').value||data.last_date,idx=data.rows.findIndex(r=>r[0]===date),row=data.rows[idx];if(!row)return;
 const norm=data.daily_normal[date.slice(5)];
 $('metrics').innerHTML=[['Précipitations',row[1],'mm',norm?.[0]],['Température moyenne',row[2],'°C',norm?.[1]],['Température minimale',row[3],'°C',norm?.[2]],['Température maximale',row[4],'°C',norm?.[3]]].map((a,i)=>`<div class="metric ${i?'temp':''}"><span>${a[0]}</span><strong>${fmt(a[1])} <span>${a[2]}</span></strong><small>Normale du jour : ${fmt(a[3])} ${a[2]}</small></div>`).join('');
 $('coverage').textContent=datefmt(date)+' · moyenne des quatre villes';$('daily-status').textContent=statusName(row[5])+' · jours complets uniquement. Les données récentes seront révisées ; aucune valeur du jour en cours.';
 const rs=data.rows.slice(Math.max(0,idx-Number($('window').value)+1),idx+1),point=(r,j)=>({x:Date.parse(r[0]+'T00:00:00Z'),y:r[j]});
 plot('daily-rain',[{name:'Pluie',color:'#007f87',bar:true,points:rs.map(r=>point(r,1))},{name:'Normale',color:'#223c52',dash:'5 4',points:rs.map(r=>({x:Date.parse(r[0]+'T00:00:00Z'),y:data.daily_normal[r[0].slice(5)]?.[0]??null}))}],{daily:true,rainBars:true,unit:'mm',axis:'Date · jour civil au Brésil'});
 plot('daily-temp',[...[[2,'Tmean','#c76b20'],[3,'Tmin','#4279bd'],[4,'Tmax','#b74351']].map(([j,name,color])=>({name,color,points:rs.map(r=>point(r,j))})),{name:'Normale Tmean',color:'#223c52',dash:'5 4',points:rs.map(r=>({x:Date.parse(r[0]+'T00:00:00Z'),y:data.daily_normal[r[0].slice(5)]?.[1]??null}))}],{daily:true,unit:'°C',axis:'Date · jour civil au Brésil'});
 $('daily-table').innerHTML=[...rs].reverse().map(r=>`<tr><td>${datefmt(r[0])}</td>${r.slice(1,5).map(v=>`<td>${fmt(v)}</td>`).join('')}<td>${statusName(r[5])}</td></tr>`).join('');
}
function yearLabel(y){return state.period===1?String(y):`${y}/${String(y+1).slice(-2)}`;}
function selectedYears(years){return state.all?years:[state.year,...state.compare].filter((y,i,a)=>years.includes(y)&&a.indexOf(y)===i);}
function renderCompare(){
 const ns=state.source==='nasa',src=ns?nasa:data;if(ns)state.frequency='monthly';
 const first=1981-(state.period===1?0:1),lastDate=ns?src.last_date:data.last_date,ly=Number(lastDate.slice(0,4))-(Number(lastDate.slice(5,7))<state.period?1:0),years=d3.range(first,ly+1);
 if(!years.includes(state.year))state.year=ly;state.compare=state.compare.filter(y=>years.includes(y)&&y!==state.year);
 ['source','period','frequency','measure'].forEach(k=>$(k).value=String(state[k]));$('frequency').disabled=ns;$('background').checked=state.background;
 $('year').innerHTML=years.slice().reverse().map(y=>`<option value="${y}">${yearLabel(y)}${y===ly?' · récente':''}</option>`).join('');$('year').value=state.year;
 $('year-buttons').innerHTML=years.slice().reverse().map(y=>`<button data-year="${y}" class="${state.compare.includes(y)?'selected':''}" aria-pressed="${state.compare.includes(y)}">${yearLabel(y)}</button>`).join('');
 $('year-buttons').querySelectorAll('button').forEach(b=>b.onclick=()=>{let y=+b.dataset.year;state.all=false;if(y!==state.year)state.compare=state.compare.includes(y)?state.compare.filter(v=>v!==y):[...state.compare,y];save();renderCompare();});
 const act=selectedYears(years),color=y=>COLORS[act.indexOf(y)%COLORS.length];
 $('selected-legend').innerHTML='<span class="normal-key">Normale 1991–2020</span>'+(state.all?'<span>Toutes les années</span>':act.map(y=>`<span style="--key:${color(y)}">${yearLabel(y)}${y===state.year?' · principale':''}</span>`).join(''))+(state.background&&!state.all?'<span>Autres années en gris</span>':'');
 $('compare-note').textContent=(ns?`NASA : dernier mois complet ${src.last_date.slice(0,7)}. GWETROOT = saturation relative 0–100 cm.`:`ERA5 jusqu’au ${datefmt(data.era5_through)} ; IFS provisoire ensuite.`)+' Normale propre à la source. Mois incomplets exclus ; jours absents laissés vides.';
 const monthly=state.frequency==='monthly',cumulative=state.frequency==='cumulative',an=state.measure==='anomaly';
 const dims=cumulative?[['Pluie cumulée',0,'mm']]:[['Précipitations',0,'mm'],['Température moyenne',1,'°C'],['Température minimale moyenne',2,'°C'],['Température maximale moyenne',3,'°C'],...(ns?[['Humidité racinaire',4,'fraction']]:[])];
 $('comparison-charts').innerHTML=dims.map(([name,j,unit])=>`<article><div class="chart-heading"><h3>${name}${an?' · anomalie':''}</h3><span>${unit}</span></div><div class="plot" id="compare-${j}"></div></article>`).join('');
 const order=d3.range(12).map(i=>(i+state.period-1)%12+1),calendarDays=[];
 order.forEach(m=>{const days=new Date(Date.UTC(2000,m,0)).getUTCDate();for(let d=1;d<=days;d++)calendarDays.push([m,d]);});
 const labels=monthly?order.map(m=>MONTHS[m-1]):calendarDays.map(([m,d])=>`${d} ${MONTHS[m-1]}`),monMap=new Map(src.monthly.map(r=>[r[0],r]));
 const monthNormals=src.normal.map(r=>r.slice());
 // When the latest year is visible, compare the unfinished month over identical days.
 const [currentYear,currentMonth,currentDay]=data.last_date.split('-').map(Number);
 if(!ns&&monthly&&act.includes(ly)&&currentDay<new Date(Date.UTC(currentYear,currentMonth,0)).getUTCDate()){
  const mm=String(currentMonth).padStart(2,'0');
  for(let yy=1981;yy<=currentYear;yy++){
   const rs=Array.from({length:currentDay},(_,i)=>byDate.get(`${yy}-${mm}-${String(i+1).padStart(2,'0')}`));
   const values=[1,2,3,4].map(j=>rs.every(r=>r&&r[j]!==null)?rs.reduce((sum,r)=>sum+r[j],0)/(j===1?1:currentDay):null);
   monMap.set(`${yy}-${mm}`,[`${yy}-${mm}`,...values]);
  }
  monthNormals[currentMonth-1]=[0,1,2,3].map(j=>Array.from({length:currentDay},(_,i)=>data.daily_normal[`${mm}-${String(i+1).padStart(2,'0')}`][j]).reduce((a,b)=>a+b,0)/(j===0?1:currentDay));
  labels[order.indexOf(currentMonth)]=`${MONTHS[currentMonth-1]} 1–${currentDay}`;
  $('compare-note').textContent=`Mois en cours : ${MONTHS[currentMonth-1]}, du 1 au ${currentDay} uniquement, pour toutes les années et la normale. Aucun total de mois complet n’est estimé. ERA5 jusqu’au ${datefmt(data.era5_through)} ; IFS provisoire ensuite.`;
 }
 for(const [name,j,unit] of dims){
  const series=[];
  for(const yy of years.filter(y=>state.background||act.includes(y))){let sum=0,nsum=0,broken=false;
   const points=monthly?order.map((m,i)=>{let year=yy+(m<state.period?1:0),key=`${year}-${String(m).padStart(2,'0')}`,r=monMap.get(key),v=r?.[j+1]??null;return{x:i,y:v===null?null:v-(an?monthNormals[m-1][j]:0)};}):calendarDays.map(([m,d],i)=>{
    let year=yy+(m<state.period?1:0),date=`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(d>new Date(Date.UTC(year,m,0)).getUTCDate())return{x:i,y:null};
    const r=byDate.get(date),v=r?.[j+1]??null,n=data.daily_normal[date.slice(5)]?.[j]??null;
    if(cumulative){if(v===null||n===null)broken=true;if(broken)return{x:i,y:null};sum+=v;nsum+=n;return{x:i,y:sum-(an?nsum:0)};}
    return{x:i,y:v===null||n===null?null:v-(an?n:0)};
   });
   const chosen=act.includes(yy);series.push({name:yearLabel(yy),points,color:state.all?'#007f87':chosen?color(yy):'#9bacba',background:!chosen,opacity:state.all?.23:chosen?1:.24,width:yy===state.year&&!state.all?3:chosen&&!state.all?2:1,markers:monthly&&chosen&&!state.all});
  }
  series.sort((a,b)=>Number(!a.background)-Number(!b.background));
  let total=0;
  const np=monthly?order.map((m,i)=>({x:i,y:an?0:monthNormals[m-1][j]})):calendarDays.map(([m,d],i)=>{let year=state.year+(m<state.period?1:0);if(d>new Date(Date.UTC(year,m,0)).getUTCDate())return{x:i,y:null};let v=data.daily_normal[`${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`]?.[j]??null;if(cumulative&&v!==null)total+=v;return{x:i,y:an?0:cumulative?total:v};});
  series.push({name:'Normale',points:np,color:'#203b50',width:2.2,dash:'6 4',normal:true});
  plot('compare-'+j,series,{labels,unit,axis:monthly?'Mois de l’année sélectionnée':'Jour de l’année sélectionnée',all:state.all});
 }
}
['source','period','year','frequency','measure','background'].forEach(k=>$(k).onchange=e=>{state[k]=k==='background'?e.target.checked:['year','period'].includes(k)?Number(e.target.value):e.target.value;if(k==='year')state.all=false;save();renderCompare();});
$('all-years').onclick=()=>{state.all=true;state.background=true;save();renderCompare();};$('date').onchange=renderDaily;$('window').onchange=renderDaily;
async function init(){try{
 if(!window.d3)throw new Error('La bibliothèque graphique n’a pas pu être chargée. Réessaie en actualisant la page.');
 const [a,b]=await Promise.all([fetch('data/weather.json',{cache:'no-cache'}),fetch('data/nasa.json',{cache:'no-cache'})]);if(!a.ok||!b.ok)throw new Error('Les données ne sont pas disponibles pour le moment.');[data,nasa]=await Promise.all([a.json(),b.json()]);byDate=new Map(data.rows.map(r=>[r[0],r]));
 $('date').min=data.rows[0][0];$('date').max=data.last_date;$('date').value=data.last_date;
 const age=(Date.now()-Date.parse(data.updated_utc))/86400000;
 $('freshness').innerHTML=`Dernier jour : ${datefmt(data.last_date)}<br>Collecte : ${new Date(data.updated_utc).toLocaleString('fr-FR',{timeZone:'Europe/London',dateStyle:'short',timeStyle:'short'})} · Londres${age>2?'<br>Actualisation en retard':''}`;
 $('points').innerHTML=data.points.map(p=>`<tr><td>${p.name}</td><td>${p.latitude}</td><td>${p.longitude}</td></tr>`).join('');renderDaily();
 }catch(e){$('error').hidden=false;$('error').textContent=e.message;$('freshness').textContent='Données indisponibles';}}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data)switchView(view);},150);});init();
