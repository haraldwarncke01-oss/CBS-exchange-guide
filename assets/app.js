const state={
  all:[],filtered:[],coords:new Map(),markers:new Map(),climate:new Map(),gridClimate:new Map(),
  arwuReady:false,arwuRankedCount:0,arwuPendingCount:0,sortKey:'availabilityYears',sortDir:-1,climateLoading:false,climateDone:0,climateTotal:0
};
const $=s=>document.querySelector(s);
const map=L.map('map',{worldCopyJump:true,minZoom:2}).setView([20,8],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
const layer=L.layerGroup().addTo(map);

function markerColor(u){if(u.availabilityYears===5)return '#15803d';if(u.availabilityYears>=3)return '#ca8a04';if(u.availabilityYears>=1)return '#ea580c';return '#64748b'}
function markerIcon(u){return L.divIcon({className:'',html:`<div class="uni-marker" style="background:${markerColor(u)}"></div>`,iconSize:[16,16],iconAnchor:[8,8]})}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function places(u,y){const v=u.history[y].places;return v==null?(u.history[y].noPlaces?'—':'?'):v}
function tempText(v){return Number.isFinite(v)?`${v.toFixed(1)}°C`:'…'}
function rankText(u){if(!state.arwuReady)return '…';if(u.arwuPending)return 'Updating…';if(u.arwuRank)return `#${u.arwuRank}`;return 'Not top 1000'}
function popupHtml(u){
  const c=state.climate.get(u.id);
  return `<div class="popup-name">${esc(u.name)}</div><div class="popup-meta">${esc(u.country)} · ${u.availabilityYears}/5 years with leftover places</div><div class="popup-facts"><span>ARWU: <strong>${esc(rankText(u))}</strong></span>${c?`<span>Sep–Dec: <strong>${tempText(c.SEP)} / ${tempText(c.OCT)} / ${tempText(c.NOV)} / ${tempText(c.DEC)}</strong></span>`:''}</div><button class="popup-btn" data-detail="${u.id}">View details</button>`
}

function sortValue(u,key){
  if(key.startsWith('temp')){const month=key.slice(4);return state.climate.get(u.id)?.[month] ?? null}
  return u[key];
}
function cmp(a,b,key,dir){
  let av=sortValue(a,key),bv=sortValue(b,key);
  if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return -1;
  if(typeof av==='string')return av.localeCompare(bv)*dir;
  return ((av===bv)?0:(av>bv?1:-1))*dir;
}

function renderMarkers(){
  layer.clearLayers();let plotted=0;
  for(const u of state.filtered){const c=state.coords.get(u.id);if(!c)continue;const m=L.marker([c.lat,c.lon],{icon:markerIcon(u)}).bindPopup(()=>popupHtml(u));m.on('popupopen',e=>{const b=e.popup.getElement()?.querySelector('[data-detail]');if(b)b.addEventListener('click',()=>openDetail(u.id),{once:true})});m.addTo(layer);plotted++}
  $('#geoStatus').textContent=`· ${plotted} shown on map`;
}
function renderTable(){
  const rows=[...state.filtered].sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
  $('#tableBody').innerHTML=rows.map(u=>{const c=state.climate.get(u.id);return `<tr>
    <td><button class="uni-link" data-detail="${u.id}">${esc(u.name)}</button>${u.school?`<div class="muted">${esc(u.school)}</div>`:''}</td>
    <td>${esc(u.country)}</td>
    <td><span class="rank-cell ${u.arwuRank?'ranked':''}">${esc(rankText(u))}</span></td>
    <td>${tempText(c?.SEP)}</td><td>${tempText(c?.OCT)}</td><td>${tempText(c?.NOV)}</td><td>${tempText(c?.DEC)}</td>
    <td>${u.latestPlaces||'—'}</td><td>${u.availabilityYears}/5</td><td><span class="badge ${u.availableLast2?'yes':'no'}">${u.availableLast2?'Yes':'No'}</span></td>
  </tr>`}).join('');
  document.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail))));
}
function applyFilters(){
  const q=$('#search').value.trim().toLowerCase(),country=$('#country').value,minP=Number($('#minPlaces').value),minA=Number($('#minAvailability').value),last2=$('#last2').checked;
  const arwuMax=Number($('#arwuMax').value),tempMonth=$('#tempMonth').value,minTempRaw=$('#minTemp').value,minTemp=minTempRaw===''?null:Number(minTempRaw);
  state.filtered=state.all.filter(u=>{
    const c=state.climate.get(u.id);
    return (!q||`${u.name} ${u.school} ${u.country}`.toLowerCase().includes(q))&&(!country||u.country===country)&&u.latestPlaces>=minP&&u.availabilityYears>=minA&&(!last2||u.availableLast2)&&(!arwuMax||(u.arwuSort&&u.arwuSort<=arwuMax))&&(minTemp==null||(c&&Number.isFinite(c[tempMonth])&&c[tempMonth]>=minTemp));
  });
  $('#visibleCount').textContent=state.filtered.length;renderMarkers();renderTable();
}
function openDetail(id){
  const u=state.all.find(x=>x.id===id);if(!u)return;const years=Object.keys(u.history),c=state.climate.get(u.id);
  const climateHtml=c?`<div class="climate-grid">${[['SEP','Sep'],['OCT','Oct'],['NOV','Nov'],['DEC','Dec']].map(([k,l])=>`<div class="climate-card"><span>${l}</span><strong>${tempText(c[k])}</strong></div>`).join('')}</div>`:`<p class="muted climate-wait">Climate is loading for this location…</p>`;
  const rankMeta=state.arwuReady?(u.arwuPending?'<strong>Ranking update pending…</strong>':(u.arwuRank?`<strong>#${esc(u.arwuRank)}</strong>${u.arwuMatchedInstitution&&u.arwuMatchedInstitution!==u.name?`<span class="muted">ARWU institution: ${esc(u.arwuMatchedInstitution)}</span>`:''}`:`<strong>Not in published top 1000</strong>`)):'<strong>Rank data loading…</strong>';
  $('#detailContent').innerHTML=`<h2 class="detail-title">${esc(u.name)}</h2><p class="detail-sub">${esc(u.school||u.country)}${u.school?` · ${esc(u.country)}`:''}</p>
    <div class="detail-metrics"><div class="metric-card"><span>ARWU 2026</span>${rankMeta}<a href="https://www.shanghairanking.com/rankings/arwu/2026" target="_blank" rel="noopener">Source</a></div><div class="metric-card climate-metric"><span>Average temperature</span>${climateHtml}<small>NASA POWER climatology</small></div></div>
    <h3 class="section-title">CBS placement history</h3><div class="history">${years.map(y=>`<div class="year-card"><strong>${y.replace('-','–')}</strong><b>${places(u,y)}</b><span class="${u.history[y].available?'avail':'not-avail'}">${u.history[y].available?'Places remained':'No recorded leftover'}</span></div>`).join('')}</div><p class="muted" style="margin-top:16px">Historical availability: <strong>${u.availabilityYears}/5 years</strong>. Available in both latest years: <strong>${u.availableLast2?'Yes':'No'}</strong>.</p>`;
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
  saveCached();const unresolved=state.all.length-state.coords.size;$('#geoStatus').textContent=`· ${state.coords.size} mapped${unresolved?` · ${unresolved} unresolved`:''}`;renderMarkers();
  loadClimateAll();
}

// NASA POWER returns monthly T2M climatologies directly. We deduplicate nearby points on the
// native grid and keep a browser cache, limiting parallel requests to four.
const climateKey='cbs-exchange-nasa-power-climate-v1';
function gridKey(c){const lat=Math.round(c.lat*2)/2,lon=Math.round(c.lon/0.625)*0.625;return `${lat.toFixed(3)},${lon.toFixed(3)}`}
function loadClimateCache(){try{const c=JSON.parse(localStorage.getItem(climateKey)||'{}');for(const [k,v] of Object.entries(c))state.gridClimate.set(k,v)}catch{}}
function saveClimateCache(){try{localStorage.setItem(climateKey,JSON.stringify(Object.fromEntries(state.gridClimate)))}catch{}}
async function fetchGridClimate(c){
  const key=gridKey(c);if(state.gridClimate.has(key))return state.gridClimate.get(key);
  const url=`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=SB&longitude=${encodeURIComponent(c.lon)}&latitude=${encodeURIComponent(c.lat)}&format=JSON`;
  const r=await fetch(url);if(!r.ok)throw new Error(`NASA POWER ${r.status}`);const j=await r.json();const p=j?.properties?.parameter?.T2M;if(!p)throw new Error('No T2M climate data');
  const v={SEP:Number(p.SEP),OCT:Number(p.OCT),NOV:Number(p.NOV),DEC:Number(p.DEC)};if(!Object.values(v).every(Number.isFinite))throw new Error('Incomplete climate data');state.gridClimate.set(key,v);return v;
}
function refreshDataStatus(){
  const arwu=state.arwuReady?(state.arwuPendingCount?`ARWU: ${state.arwuRankedCount} matched · ${state.arwuPendingCount} awaiting update`:`ARWU: ${state.arwuRankedCount} partner entries in published top 1000`):'ARWU: loading';
  const climate=state.climateLoading?`Climate: ${state.climateDone}/${state.climateTotal} locations`:`Climate: ${state.climate.size}/${state.all.length} loaded`;
  $('#dataStatus').textContent=`${arwu} · ${climate}`;
}
async function loadClimateForIds(ids){
  const groups=new Map();for(const id of ids){if(state.climate.has(id))continue;const c=state.coords.get(id);if(!c)continue;const k=gridKey(c);if(!groups.has(k))groups.set(k,{c,ids:[]});groups.get(k).ids.push(id)}
  for(const g of groups.values()){try{const v=await fetchGridClimate(g.c);for(const id of g.ids)state.climate.set(id,v)}catch{}}
  saveClimateCache();renderTable();renderMarkers();refreshDataStatus();
}
async function loadClimateAll(){
  if(state.climateLoading)return;loadClimateCache();
  const groups=new Map();for(const u of state.all){const c=state.coords.get(u.id);if(!c)continue;const k=gridKey(c);if(!groups.has(k))groups.set(k,{c,ids:[]});groups.get(k).ids.push(u.id)}
  for(const g of groups.values()){const cached=state.gridClimate.get(gridKey(g.c));if(cached)for(const id of g.ids)state.climate.set(id,cached)}
  const pending=[...groups.values()].filter(g=>!state.gridClimate.has(gridKey(g.c)));state.climateLoading=true;state.climateDone=groups.size-pending.length;state.climateTotal=groups.size;refreshDataStatus();renderTable();
  let next=0;async function worker(){while(next<pending.length){const i=next++,g=pending[i];try{const v=await fetchGridClimate(g.c);for(const id of g.ids)state.climate.set(id,v)}catch{}state.climateDone++;if(state.climateDone%6===0||state.climateDone===state.climateTotal){saveClimateCache();refreshDataStatus();applyFilters()}await new Promise(r=>setTimeout(r,120))}}
  await Promise.all(Array.from({length:Math.min(4,pending.length||1)},worker));state.climateLoading=false;saveClimateCache();refreshDataStatus();applyFilters();
}

function rankLower(rank){if(!rank)return null;const m=String(rank).match(/\d+/);return m?Number(m[0]):null}
async function loadArwu(){
  try{
    const r=await fetch('data/arwu2026.json',{cache:'no-store'});if(!r.ok)throw new Error('rank file unavailable');const j=await r.json();const entries=j.universities||j;
    let ranked=0,pending=0;for(const u of state.all){const x=entries[String(u.id)];if(x===undefined){u.arwuRank=null;u.arwuSort=null;u.arwuPending=true;pending++;continue}const rank=typeof x==='object'&&x!==null?x.rank:x;u.arwuRank=rank||null;u.arwuSort=rankLower(rank);u.arwuMatchedInstitution=(typeof x==='object'&&x)?x.matchedInstitution:null;u.arwuPending=false;if(u.arwuRank)ranked++}
    state.arwuRankedCount=ranked;state.arwuPendingCount=pending;state.arwuReady=true;
  }catch(e){console.warn('ARWU data not ready yet',e);state.arwuReady=false}
  refreshDataStatus();applyFilters();
}

async function init(){
  const r=await fetch('data/universities.json');state.all=await r.json();state.filtered=[...state.all];const countries=[...new Set(state.all.map(u=>u.country))].sort();$('#totalCount').textContent=state.all.length;$('#countryCount').textContent=countries.length;$('#country').insertAdjacentHTML('beforeend',countries.map(c=>`<option>${esc(c)}</option>`).join(''));
  for(const el of ['search','country','minPlaces','minAvailability','arwuMax','tempMonth','minTemp','last2'])$("#"+el).addEventListener(el==='search'?'input':'change',applyFilters);
  $('#reset').addEventListener('click',()=>{$('#search').value='';$('#country').value='';$('#minPlaces').value='0';$('#minAvailability').value='0';$('#arwuMax').value='0';$('#tempMonth').value='SEP';$('#minTemp').value='';$('#last2').checked=false;applyFilters()});
  document.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.sort;if(state.sortKey===k)state.sortDir*=-1;else{state.sortKey=k;state.sortDir=(k==='name'||k==='country'||k==='arwuSort')?1:-1}renderTable()}));
  $('#mapBtn').addEventListener('click',()=>switchView('map'));$('#listBtn').addEventListener('click',()=>switchView('list'));$('#closeDialog').addEventListener('click',()=>$('#detailDialog').close());
  loadClimateCache();applyFilters();loadArwu();resolveCoordinates();refreshDataStatus();
}
function switchView(v){const isMap=v==='map';$('#mapView').classList.toggle('active',isMap);$('#listView').classList.toggle('active',!isMap);$('#mapBtn').classList.toggle('active',isMap);$('#listBtn').classList.toggle('active',!isMap);if(isMap)setTimeout(()=>map.invalidateSize(),50)}
init().catch(e=>{$('#geoStatus').textContent='· could not load dataset';console.error(e)});
