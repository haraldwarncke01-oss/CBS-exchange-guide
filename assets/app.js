const YEARS=['2026-2027','2025-2026','2024-2025','2023-2024','2022-2023'];
const STATUS_META={
  available:{label:'Places available',short:'Places available',order:0,bg:'#ffffff',border:'#64748b'},
  filled:{label:'All places filled',short:'All places filled',order:1,bg:'#50D691',border:'#ffffff'},
  competitive:{label:'All places filled — competitive',short:'Competitive',order:2,bg:'#FDDB71',border:'#ffffff'},
  very_competitive:{label:'All places filled — very competitive',short:'Very competitive',order:3,bg:'#8586C6',border:'#ffffff'},
  no_places:{label:'No places offered',short:'No places',order:null,bg:'#eef2f6',border:'#94a3b8'},
  no_data:{label:'No data',short:'No data',order:null,bg:'#eef2f6',border:'#94a3b8'},
  unknown:{label:'No comparable years',short:'No comparable years',order:null,bg:'#cbd5e1',border:'#64748b'}
};
const state={
  all:[],filtered:[],coords:new Map(),markers:new Map(),climate:new Map(),gridClimate:new Map(),
  arwuReady:false,arwuRankedCount:0,arwuPendingCount:0,sortKey:'demandScore',sortDir:1,climateLoading:false,climateDone:0,climateTotal:0
};
const $=s=>document.querySelector(s);
const map=L.map('map',{worldCopyJump:true,minZoom:2}).setView([20,8],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
const layer=L.layerGroup().addTo(map);

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function selectedYears(){const n=Number($('#historyWindow')?.value||5);return YEARS.slice(0,n)}
function windowLabel(){const n=Number($('#historyWindow')?.value||5);return n===1?'2026–27 only':n===5?'all 5 years':`last ${n} years`}
function places(u,y){const h=u.history[y],v=h?.places;return v==null?(h?.noPlaces?'—':h?.noData?'—':'?'):v}
function tempText(v){return Number.isFinite(v)?`${v.toFixed(1)}°C`:'…'}
function climateValue(c,key){if(!c)return null;if(key==='AVG'){const vals=['SEP','OCT','NOV','DEC'].map(k=>c[k]).filter(Number.isFinite);return vals.length===4?vals.reduce((a,b)=>a+b,0)/4:null}return Number.isFinite(c[key])?c[key]:null}
function rankText(u){if(!state.arwuReady)return '…';if(u.arwuPending)return 'Updating…';if(u.arwuRank)return `#${u.arwuRank}`;return 'Not top 1000'}

function competitionSummary(u){
  const years=selectedYears();
  const allObs=years.map(year=>({year,status:u.history[year]?.status||'unknown'}));
  const obs=allObs.filter(x=>Number.isFinite(STATUS_META[x.status]?.order));
  if(!obs.length)return{status:'unknown',order:null,observed:0,selected:years.length,excluded:years.length,override:null,base:'unknown'};
  const counts={};for(const x of obs)counts[x.status]=(counts[x.status]||0)+1;
  const maxCount=Math.max(...Object.values(counts));
  const candidates=new Set(Object.keys(counts).filter(k=>counts[k]===maxCount));
  const base=obs.find(x=>candidates.has(x.status)).status; // ties favor the most recent comparable year
  let status=base,override=null;
  const baseOrder=STATUS_META[base].order;
  if(obs.length>=2&&obs[0].status===obs[1].status){
    const recentOrder=STATUS_META[obs[0].status].order;
    if(Math.abs(recentOrder-baseOrder)>=2){status=obs[0].status;override='two_recent'}
  }
  if(!override&&obs.length>=1){
    const recentOrder=STATUS_META[obs[0].status].order;
    if(Math.abs(recentOrder-baseOrder)>=3){status=obs[0].status;override='latest_extreme'}
  }
  return{status,order:STATUS_META[status].order,observed:obs.length,selected:years.length,excluded:years.length-obs.length,override,base,counts};
}
function availabilityInWindow(u){return selectedYears().filter(y=>u.history[y]?.status==='available').length}
function demandChip(status,label=null){const meta=STATUS_META[status]||STATUS_META.unknown;return `<span class="status-chip status-${esc(status)}">${esc(label||meta.short)}</span>`}
function summaryExplanation(s){
  if(s.status==='unknown')return 'No comparable CBS demand observation in the selected period.';
  let text='Most frequent comparable category in the selected period; ties favor the most recent year.';
  if(s.override==='two_recent')text='Recent shift applied: the two most recent comparable years agree and differ strongly from the older majority.';
  if(s.override==='latest_extreme')text='Recent shift applied: the latest comparable year is an extreme reversal from the older majority.';
  if(s.excluded)text+=` ${s.excluded} selected year${s.excluded===1?' was':'s were'} excluded because CBS recorded “No places” or “No data”.`;
  return text;
}
function markerIcon(u){const s=competitionSummary(u),m=STATUS_META[s.status]||STATUS_META.unknown;return L.divIcon({className:'',html:`<div class="uni-marker" style="background:${m.bg};border-color:${m.border}"></div>`,iconSize:[17,17],iconAnchor:[8,8]})}
function popupHtml(u){
  const c=state.climate.get(u.id),s=competitionSummary(u),avg=climateValue(c,'AVG');
  return `<div class="popup-name">${esc(u.name)}</div><div class="popup-meta">${esc(u.country)} · ${esc(windowLabel())}</div><div class="popup-facts"><div class="popup-demand">${demandChip(s.status)}</div><span>ARWU: <strong>${esc(rankText(u))}</strong></span>${Number.isFinite(avg)?`<span>Sep–Dec average: <strong>${tempText(avg)}</strong></span>`:''}</div><button class="popup-btn" data-detail="${u.id}">View details</button>`
}

function sortValue(u,key){
  if(key==='demandScore'){const s=competitionSummary(u);return s.order==null?99:s.order}
  if(key==='availabilityWindow')return availabilityInWindow(u);
  if(key.startsWith('temp')){const metric=key.slice(4);return climateValue(state.climate.get(u.id),metric)}
  return u[key];
}
function cmp(a,b,key,dir){let av=sortValue(a,key),bv=sortValue(b,key);if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return -1;if(typeof av==='string')return av.localeCompare(bv)*dir;return ((av===bv)?0:(av>bv?1:-1))*dir}

function renderMarkers(){
  layer.clearLayers();let plotted=0;
  for(const u of state.filtered){const c=state.coords.get(u.id);if(!c)continue;const m=L.marker([c.lat,c.lon],{icon:markerIcon(u)}).bindPopup(()=>popupHtml(u));m.on('popupopen',e=>{const b=e.popup.getElement()?.querySelector('[data-detail]');if(b)b.addEventListener('click',()=>openDetail(u.id),{once:true})});m.addTo(layer);plotted++}
  $('#geoStatus').textContent=`· ${plotted} shown on map`;
}
function renderTable(){
  const n=selectedYears().length,rows=[...state.filtered].sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
  $('#tableBody').innerHTML=rows.map(u=>{const c=state.climate.get(u.id),s=competitionSummary(u);return `<tr>
    <td><button class="uni-link" data-detail="${u.id}">${esc(u.name)}</button>${u.school?`<div class="muted">${esc(u.school)}</div>`:''}</td>
    <td>${esc(u.country)}</td>
    <td>${demandChip(s.status)}</td>
    <td><span class="rank-cell ${u.arwuRank?'ranked':''}">${esc(rankText(u))}</span></td>
    <td>${tempText(climateValue(c,'AVG'))}</td>
    <td>${u.latestPlaces??'—'}</td><td>${availabilityInWindow(u)}/${n}</td><td><span class="badge ${u.availableLast2?'yes':'no'}">${u.availableLast2?'Yes':'No'}</span></td>
  </tr>`}).join('');
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail))));
}
function refreshWindowUI(){$('#legendWindow').textContent=`Map colors · ${windowLabel()}`}
function applyFilters(){
  const q=$('#search').value.trim().toLowerCase(),country=$('#country').value,minP=Number($('#minPlaces').value),demand=$('#demandLevel').value,last2=$('#last2').checked;
  const arwuMax=Number($('#arwuMax').value),tempMetric=$('#tempMetric').value,minTempRaw=$('#minTemp').value,minTemp=minTempRaw===''?null:Number(minTempRaw);
  state.filtered=state.all.filter(u=>{const c=state.climate.get(u.id),s=competitionSummary(u),tv=climateValue(c,tempMetric);return (!q||`${u.name} ${u.school} ${u.country}`.toLowerCase().includes(q))&&(!country||u.country===country)&&(u.latestPlaces??0)>=minP&&(!demand||s.status===demand)&&(!last2||u.availableLast2)&&(!arwuMax||(u.arwuSort&&u.arwuSort<=arwuMax))&&(minTemp==null||(Number.isFinite(tv)&&tv>=minTemp))});
  $('#visibleCount').textContent=state.filtered.length;refreshWindowUI();renderMarkers();renderTable();
}
function openDetail(id){
  const u=state.all.find(x=>x.id===id);if(!u)return;const c=state.climate.get(u.id),s=competitionSummary(u),windowSet=new Set(selectedYears()),avg=climateValue(c,'AVG');
  const climateHtml=c?`<div class="climate-summary"><strong>${tempText(avg)}</strong><span>Sep–Dec average</span></div><details class="month-breakdown"><summary>Monthly breakdown</summary><div class="climate-grid">${[['SEP','Sep'],['OCT','Oct'],['NOV','Nov'],['DEC','Dec']].map(([k,l])=>`<div class="climate-card"><span>${l}</span><strong>${tempText(c[k])}</strong></div>`).join('')}</div></details>`:`<p class="muted climate-wait">Climate is loading for this location…</p>`;
  const rankMeta=state.arwuReady?(u.arwuPending?'<strong>Ranking update pending…</strong>':(u.arwuRank?`<strong>#${esc(u.arwuRank)}</strong>${u.arwuMatchedInstitution&&u.arwuMatchedInstitution!==u.name?`<span class="muted">ARWU institution: ${esc(u.arwuMatchedInstitution)}</span>`:''}`:`<strong>Not in published top 1000</strong>`)):'<strong>Rank data loading…</strong>';
  const shift=s.override?'<span class="recent-shift">Recent shift</span>':'';
  $('#detailContent').innerHTML=`<h2 class="detail-title">${esc(u.name)}</h2><p class="detail-sub">${esc(u.school||u.country)}${u.school?` · ${esc(u.country)}`:''}</p>
    <div class="detail-metrics">
      <div class="metric-card"><span>CBS demand · ${esc(windowLabel())}</span><div class="demand-summary">${demandChip(s.status)}${shift}</div><small>${s.observed}/${s.selected} selected years comparable</small></div>
      <div class="metric-card"><span>ARWU 2026</span>${rankMeta}<a href="https://www.shanghairanking.com/rankings/arwu/2026" target="_blank" rel="noopener">Source</a></div>
      <div class="metric-card climate-metric"><span>Exchange-period temperature</span>${climateHtml}<small>NASA POWER climatology</small></div>
    </div>
    <div class="section-head"><h3 class="section-title">CBS placement history</h3><span class="window-note">Highlighted years are used for the current map color</span></div>
    <div class="history">${YEARS.map(y=>{const h=u.history[y],st=h.status||'unknown';return `<div class="year-card status-${esc(st)} ${windowSet.has(y)?'':'outside-window'}"><strong>${y.replace('-','–')}</strong><b>${places(u,y)}</b><span class="year-status">${esc(STATUS_META[st]?.label||h.statusLabel||'Unknown')}</span></div>`}).join('')}</div>
    <p class="summary-explain"><strong>Overall for ${esc(windowLabel())}:</strong> ${esc(STATUS_META[s.status]?.short||'No comparable years')}. ${esc(summaryExplanation(s))}</p>`;
  if(!$('#detailDialog').open)$('#detailDialog').showModal();
  if(!c){loadClimateForIds([u.id]).then(()=>{if($('#detailDialog').open)openDetail(u.id)}).catch(()=>{})}
}

// Wikipedia supplies coordinates without an API key. Cached locally for fast repeat visits.
const coordKey='cbs-exchange-coords-v1';
function loadCached(){try{const c=JSON.parse(localStorage.getItem(coordKey)||'{}');for(const [id,v] of Object.entries(c))state.coords.set(Number(id),v)}catch{}}
function saveCached(){try{localStorage.setItem(coordKey,JSON.stringify(Object.fromEntries(state.coords)))}catch{}}
async function wikiBatch(batch){const titles=batch.map(u=>u.lookupName).join('|');const url='https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=coordinates&colimit=max&titles='+encodeURIComponent(titles);const r=await fetch(url);if(!r.ok)throw new Error('Wikipedia coordinate lookup failed');const j=await r.json();const byTitle=new Map(batch.map(u=>[u.lookupName.toLowerCase(),u]));for(const p of Object.values(j.query?.pages||{})){if(!p.coordinates?.[0])continue;let u=byTitle.get((p.title||'').toLowerCase());if(!u){u=batch.find(x=>p.title?.toLowerCase().includes(x.lookupName.toLowerCase())||x.lookupName.toLowerCase().includes((p.title||'').toLowerCase()))}if(u)state.coords.set(u.id,{lat:p.coordinates[0].lat,lon:p.coordinates[0].lon,source:'Wikipedia'})}}
async function wikiSearchOne(u){const query=`${u.lookupName} ${u.country}`;const surl='https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch='+encodeURIComponent(query)+'&prop=coordinates&colimit=max';try{const r=await fetch(surl);if(!r.ok)return;const j=await r.json();const p=Object.values(j.query?.pages||{})[0];if(p?.coordinates?.[0])state.coords.set(u.id,{lat:p.coordinates[0].lat,lon:p.coordinates[0].lon,source:'Wikipedia search'})}catch{}}
async function resolveCoordinates(){
  loadCached();renderMarkers();const missing=state.all.filter(u=>!state.coords.has(u.id));
  for(let i=0;i<missing.length;i+=40){try{await wikiBatch(missing.slice(i,i+40))}catch{}$('#geoStatus').textContent=`· locating universities ${Math.min(i+40,missing.length)}/${missing.length}`;renderMarkers()}
  const still=state.all.filter(u=>!state.coords.has(u.id));for(let i=0;i<still.length;i+=6){await Promise.all(still.slice(i,i+6).map(wikiSearchOne));$('#geoStatus').textContent=`· resolving ${Math.min(i+6,still.length)}/${still.length} unmatched`;renderMarkers()}
  saveCached();const unresolved=state.all.length-state.coords.size;$('#geoStatus').textContent=`· ${state.coords.size} mapped${unresolved?` · ${unresolved} unresolved`:''}`;renderMarkers();loadClimateAll();
}

// NASA POWER returns monthly T2M climatologies directly. Nearby universities share a grid request.
const climateKey='cbs-exchange-nasa-power-climate-v1';
function gridKey(c){const lat=Math.round(c.lat*2)/2,lon=Math.round(c.lon/0.625)*0.625;return `${lat.toFixed(3)},${lon.toFixed(3)}`}
function loadClimateCache(){try{const c=JSON.parse(localStorage.getItem(climateKey)||'{}');for(const [k,v] of Object.entries(c))state.gridClimate.set(k,v)}catch{}}
function saveClimateCache(){try{localStorage.setItem(climateKey,JSON.stringify(Object.fromEntries(state.gridClimate)))}catch{}}
async function fetchGridClimate(c){const key=gridKey(c);if(state.gridClimate.has(key))return state.gridClimate.get(key);const url=`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=SB&longitude=${encodeURIComponent(c.lon)}&latitude=${encodeURIComponent(c.lat)}&format=JSON`;const r=await fetch(url);if(!r.ok)throw new Error(`NASA POWER ${r.status}`);const j=await r.json();const p=j?.properties?.parameter?.T2M;if(!p)throw new Error('No T2M climate data');const v={SEP:Number(p.SEP),OCT:Number(p.OCT),NOV:Number(p.NOV),DEC:Number(p.DEC)};if(!Object.values(v).every(Number.isFinite))throw new Error('Incomplete climate data');state.gridClimate.set(key,v);return v}
function refreshDataStatus(){const arwu=state.arwuReady?(state.arwuPendingCount?`ARWU: ${state.arwuRankedCount} matched · ${state.arwuPendingCount} awaiting update`:`ARWU: ${state.arwuRankedCount} partner entries in published top 1000`):'ARWU: loading';const climate=state.climateLoading?`Climate: ${state.climateDone}/${state.climateTotal} locations`:`Climate: ${state.climate.size}/${state.all.length} loaded`;$('#dataStatus').textContent=`${arwu} · ${climate}`}
async function loadClimateForIds(ids){const groups=new Map();for(const id of ids){if(state.climate.has(id))continue;const c=state.coords.get(id);if(!c)continue;const k=gridKey(c);if(!groups.has(k))groups.set(k,{c,ids:[]});groups.get(k).ids.push(id)}for(const g of groups.values()){try{const v=await fetchGridClimate(g.c);for(const id of g.ids)state.climate.set(id,v)}catch{}}saveClimateCache();renderTable();renderMarkers();refreshDataStatus()}
async function loadClimateAll(){if(state.climateLoading)return;loadClimateCache();const groups=new Map();for(const u of state.all){const c=state.coords.get(u.id);if(!c)continue;const k=gridKey(c);if(!groups.has(k))groups.set(k,{c,ids:[]});groups.get(k).ids.push(u.id)}for(const g of groups.values()){const cached=state.gridClimate.get(gridKey(g.c));if(cached)for(const id of g.ids)state.climate.set(id,cached)}const pending=[...groups.values()].filter(g=>!state.gridClimate.has(gridKey(g.c)));state.climateLoading=true;state.climateDone=groups.size-pending.length;state.climateTotal=groups.size;refreshDataStatus();renderTable();let next=0;async function worker(){while(next<pending.length){const i=next++,g=pending[i];try{const v=await fetchGridClimate(g.c);for(const id of g.ids)state.climate.set(id,v)}catch{}state.climateDone++;if(state.climateDone%6===0||state.climateDone===state.climateTotal){saveClimateCache();refreshDataStatus();applyFilters()}await new Promise(r=>setTimeout(r,120))}}await Promise.all(Array.from({length:Math.min(4,pending.length||1)},worker));state.climateLoading=false;saveClimateCache();refreshDataStatus();applyFilters()}

function rankLower(rank){if(!rank)return null;const m=String(rank).match(/\d+/);return m?Number(m[0]):null}
async function loadArwu(){try{const r=await fetch('data/arwu2026.json',{cache:'no-store'});if(!r.ok)throw new Error('rank file unavailable');const j=await r.json();const entries=j.universities||j;let ranked=0,pending=0;for(const u of state.all){const x=entries[String(u.id)];if(x===undefined){u.arwuRank=null;u.arwuSort=null;u.arwuPending=true;pending++;continue}const rank=typeof x==='object'&&x!==null?x.rank:x;u.arwuRank=rank||null;u.arwuSort=rankLower(rank);u.arwuMatchedInstitution=(typeof x==='object'&&x)?x.matchedInstitution:null;u.arwuPending=false;if(u.arwuRank)ranked++}state.arwuRankedCount=ranked;state.arwuPendingCount=pending;state.arwuReady=true}catch(e){console.warn('ARWU data not ready yet',e);state.arwuReady=false}refreshDataStatus();applyFilters()}

async function init(){
  const r=await fetch('data/universities.json');state.all=await r.json();state.filtered=[...state.all];const countries=[...new Set(state.all.map(u=>u.country))].sort();$('#totalCount').textContent=state.all.length;$('#countryCount').textContent=countries.length;$('#country').insertAdjacentHTML('beforeend',countries.map(c=>`<option>${esc(c)}</option>`).join(''));
  for(const el of ['search','country','minPlaces','historyWindow','demandLevel','arwuMax','tempMetric','minTemp','last2'])$('#'+el).addEventListener(el==='search'?'input':'change',applyFilters);
  $('#reset').addEventListener('click',()=>{$('#search').value='';$('#country').value='';$('#minPlaces').value='0';$('#historyWindow').value='5';$('#demandLevel').value='';$('#arwuMax').value='0';$('#tempMetric').value='AVG';$('#minTemp').value='';$('#last2').checked=false;applyFilters()});
  document.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.sort;if(state.sortKey===k)state.sortDir*=-1;else{state.sortKey=k;state.sortDir=(k==='name'||k==='country'||k==='arwuSort'||k==='demandScore')?1:-1}renderTable()}));
  $('#mapBtn').addEventListener('click',()=>switchView('map'));$('#listBtn').addEventListener('click',()=>switchView('list'));$('#closeDialog').addEventListener('click',()=>$('#detailDialog').close());
  loadClimateCache();applyFilters();loadArwu();resolveCoordinates();refreshDataStatus();
}
function switchView(v){const isMap=v==='map';$('#mapView').classList.toggle('active',isMap);$('#listView').classList.toggle('active',!isMap);$('#mapBtn').classList.toggle('active',isMap);$('#listBtn').classList.toggle('active',!isMap);if(isMap)setTimeout(()=>map.invalidateSize(),50)}
init().catch(e=>{$('#geoStatus').textContent='· could not load dataset';console.error(e)});
