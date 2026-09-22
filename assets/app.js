const BUILTIN_ARWU={}; // Fallback only; primary ARWU snapshot is data/arwu_2026.csv.

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

// Geographic continent used only for filtering. Turkey is grouped with Asia because the
// CBS partner campuses in this file are primarily in Ankara/Istanbul and a single bucket is required.
const COUNTRY_CODE={
  'Argentina':'AR','Australia':'AU','Austria':'AT','Belgium':'BE','Brazil':'BR','Canada':'CA','Chile':'CL','China':'CN','Colombia':'CO','Egypt':'EG',
  'Estonia':'EE','Faroe Islands':'FO','Finland':'FI','France':'FR','Germany':'DE','Greece':'GR','Greenland':'GL','Hong Kong':'HK','Iceland':'IS','Indonesia':'ID',
  'Ireland':'IE','Israel':'IL','Italy':'IT','Japan':'JP','Lithuania':'LT','Malaysia':'MY','Mexico':'MX','Morocco':'MA','Netherlands':'NL','New Zealand':'NZ',
  'Norway':'NO','Peru':'PE','Poland':'PL','Portugal':'PT','Singapore':'SG','Slovenia':'SI','South Korea':'KR','Spain':'ES','Sweden':'SE','Switzerland':'CH',
  'Taiwan':'TW','Thailand':'TH','Turkey':'TR','United Kingdom':'GB','United States':'US','Uruguay':'UY'
};
function countryFlag(country){const code=COUNTRY_CODE[country];return code?[...code].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join(''):'🌐'}
function countryLineHtml(country){return `<span class="country-line"><span class="country-flag" aria-hidden="true">${countryFlag(country)}</span><strong>${esc(country)}</strong></span>`}

const CONTINENT_BY_COUNTRY={
  'Argentina':'South America','Australia':'Oceania','Austria':'Europe','Belgium':'Europe','Brazil':'South America',
  'Canada':'North America','Chile':'South America','China':'Asia','Colombia':'South America','Egypt':'Africa',
  'Estonia':'Europe','Faroe Islands':'Europe','Finland':'Europe','France':'Europe','Germany':'Europe','Greece':'Europe',
  'Greenland':'North America','Hong Kong':'Asia','Iceland':'Europe','Indonesia':'Asia','Ireland':'Europe','Israel':'Asia',
  'Italy':'Europe','Japan':'Asia','Lithuania':'Europe','Malaysia':'Asia','Mexico':'North America','Morocco':'Africa',
  'Netherlands':'Europe','New Zealand':'Oceania','Norway':'Europe','Peru':'South America','Poland':'Europe','Portugal':'Europe',
  'Singapore':'Asia','Slovenia':'Europe','South Korea':'Asia','Spain':'Europe','Sweden':'Europe','Switzerland':'Europe',
  'Taiwan':'Asia','Thailand':'Asia','Turkey':'Asia','United Kingdom':'Europe','United States':'North America','Uruguay':'South America'
};

// Numbeo 2026 Mid-Year country-level Cost of Living Plus Rent Index.
// This is deliberately a country-level comparison proxy, not a student monthly budget.
const COST_RENT_2026={}; // Fallback only; primary cost snapshot is data/cost_of_living.csv.
const NUMBEO_URL='https://www.numbeo.com/cost-of-living/rankings_by_country_result.jsp';
const DENMARK_COST_RENT_2026=54.80; // Numbeo 2026 Mid-Year country Cost of Living + Rent Index
const WIKIDATA_URL='https://www.wikidata.org/wiki/Property:P571';

// City-centre or campus-area coordinate fallbacks for partner names that are often not
// returned correctly by Wikipedia's title-based coordinate lookup. They are used for climate,
// not for navigation, so city-scale accuracy is sufficient.
const COORD_OVERRIDES={
  2:{lat:-34.6037,lon:-58.3816,source:'City fallback — Buenos Aires/Pilar region'},
  3:{lat:-32.9442,lon:-60.6505,source:'City fallback — Rosario'},
  26:{lat:50.8798,lon:4.7005,source:'City fallback — Leuven'},
  28:{lat:-23.5505,lon:-46.6333,source:'City fallback — São Paulo'},
  46:{lat:-33.4489,lon:-70.6693,source:'City fallback — Santiago'},
  51:{lat:22.5431,lon:114.0579,source:'City fallback — Shenzhen'},
  55:{lat:29.8683,lon:121.5440,source:'City fallback — Ningbo'},
  113:{lat:45.4642,lon:9.1900,source:'City fallback — Milan'},
  125:{lat:3.0646,lon:101.6031,source:'Campus-area fallback — Bandar Sunway'},
  127:{lat:19.4326,lon:-99.1332,source:'City fallback — Mexico City'},
  128:{lat:20.6597,lon:-103.3496,source:'City fallback — Guadalajara'},
  129:{lat:19.4326,lon:-99.1332,source:'City fallback — Mexico City'},
  130:{lat:25.6866,lon:-100.3161,source:'City fallback — Monterrey'},
  131:{lat:20.5888,lon:-100.3899,source:'City fallback — Querétaro'},
  132:{lat:19.3574,lon:-99.2760,source:'District fallback — Santa Fe, Mexico City'},
  170:{lat:43.2630,lon:-2.9350,source:'City fallback — Bilbao'},
  171:{lat:43.3183,lon:-1.9812,source:'City fallback — San Sebastián'}
};

// City names are loaded from Wikidata alongside university age/history.
// These overrides cover CBS campus names where the city is explicit but Wikidata may resolve to a parent institution.
// City and continent data are loaded from data/university_locations.csv.
// Wikidata is used only as a fallback if a row is missing from that file.

const state={
  all:[],filtered:[],coords:new Map(),markers:new Map(),climate:new Map(),gridClimate:new Map(),profiles:new Map(),costByCountry:new Map(),requirements:new Map(),
  favorites:new Set(),compare:new Set(),
  arwuReady:false,arwuRankedCount:0,arwuPendingCount:0,sortKey:'demandScore',sortDir:1,
  climateLoading:false,climateDone:0,climateTotal:0,profileLoading:false,profileDone:0,profileTotal:0,currentDetailId:null
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
function formatRank(rank){const s=String(rank||'');return /^\d+$/.test(s)?`#${s}`:s.replace('-', '–')}
function rankText(u){if(!state.arwuReady)return '…';if(u.arwuRank)return formatRank(u.arwuRank);return 'No ARWU match'}
function continent(u){return u.continent||CONTINENT_BY_COUNTRY[u.country]||'Other'}
function costIndex(u){const row=state.costByCountry.get(u.country);const v=row?.index;return Number.isFinite(v)?v:null}
function costVsDenmark(u){const row=state.costByCountry.get(u.country);if(Number.isFinite(row?.pct))return row.pct;const v=costIndex(u),dk=Number.isFinite(row?.denmark)?row.denmark:DENMARK_COST_RENT_2026;return Number.isFinite(v)&&Number.isFinite(dk)?((v/dk)-1)*100:null}
function costVsDenmarkText(u){const pct=costVsDenmark(u);if(!Number.isFinite(pct))return '—';const n=Math.round(Math.abs(pct));if(n<3)return 'About the same as Denmark';return pct<0?`${n}% cheaper than Denmark`:`${n}% more expensive than Denmark`}
function costLevel(u){const pct=costVsDenmark(u);if(!Number.isFinite(pct))return '';if(pct<=-35)return 'Much cheaper';if(pct<=-15)return 'Cheaper';if(pct<15)return 'Similar';if(pct<35)return 'More expensive';return 'Much more expensive'}
function profile(u){return state.profiles.get(u.id)||null}
function foundedYear(u){const y=profile(u)?.foundedYear;return Number.isFinite(y)?y:null}
function city(u){return u.city||profile(u)?.city||null}
function locationText(u){const c=city(u);return c?`${u.country} · ${c}`:u.country}
function ageText(year){if(!Number.isFinite(year))return 'Unknown';const age=Math.max(0,new Date().getFullYear()-year);return `${year} · about ${age} years old`}
function heritageLabel(year){if(!Number.isFinite(year))return null;if(year<1800)return 'Very old institution';if(year<1900)return 'Historic institution';if(year<1950)return 'Long-established institution';return 'Modern institution'}
function yearsOld(year){return Number.isFinite(year)?Math.max(0,new Date().getFullYear()-year):null}
function requirement(u){return state.requirements.get(u.id)||null}
function gpaReqText(u){const r=requirement(u);return Number.isFinite(r?.minGpa)?r.minGpa.toFixed(1):'—'}
function proofLabel(v){return ({none:'No documentation',documentation:'Documentation required',test:'Language test required',unclear:'Unclear'})[v]||'Unclear'}
function englishCoursesLabel(v){return ({all:'All',many:'Many',several:'Several',limited:'Limited',none:'None',unclear:'Unclear'})[v]||'Unclear'}
function englishOnlyLabel(v){return ({yes:'Yes',no:'No',unclear:'Unclear'})[v]||'Unclear'}
function housingLabel(v){return ({available:'On-campus available',unavailable:'No on-campus housing',unclear:'Unclear'})[v]||'Unclear'}
function academicLabel(v){return ({semester:'Semester',trimester:'Trimester',quarter:'Quarter',term:'Term',unclear:'Unclear'})[v]||'Unclear'}
function nonEnglishLabel(r){if(!r)return 'Unclear';if(r.nonEnglishRequirement==='required')return `Required${r.nonEnglishLanguages?`: ${r.nonEnglishLanguages}`:''}`;if(r.nonEnglishRequirement==='conditional')return `Only if using ${r.nonEnglishLanguages||'local-language'} courses`;if(r.nonEnglishRequirement==='not_required')return 'Not required';return 'Unclear'}
function selectedText(id){const el=$('#'+id);return el?.selectedOptions?.[0]?.textContent?.trim()||''}
const favoritesKey='cbs-exchange-favorites-v1',compareKey='cbs-exchange-compare-v1';
function loadSavedSelections(){
  try{state.favorites=new Set((JSON.parse(localStorage.getItem(favoritesKey)||'[]')||[]).map(Number))}catch{state.favorites=new Set()}
  try{state.compare=new Set((JSON.parse(localStorage.getItem(compareKey)||'[]')||[]).map(Number))}catch{state.compare=new Set()}
  const fromUrl=new URLSearchParams(location.search).get('compare');
  if(fromUrl){const ids=fromUrl.split(',').map(Number).filter(Number.isFinite);if(ids.length)state.compare=new Set(ids)}
}
function saveSelections(){
  try{localStorage.setItem(favoritesKey,JSON.stringify([...state.favorites]));localStorage.setItem(compareKey,JSON.stringify([...state.compare]))}catch{}
}
function isFavorite(id){return state.favorites.has(Number(id))}
function isCompared(id){return state.compare.has(Number(id))}
function favoriteButton(u,compact=false){const on=isFavorite(u.id);return `<button type="button" class="favorite-btn ${on?'active':''} ${compact?'compact':''}" data-favorite="${u.id}" aria-pressed="${on}" title="${on?'Remove from favorites':'Add to favorites'}"><span aria-hidden="true">${on?'★':'☆'}</span>${compact?'':`<span>${on?'Favorite':'Add favorite'}</span>`}</button>`}
function compareButton(u,compact=false){const on=isCompared(u.id);return `<button type="button" class="compare-toggle ${on?'active':''} ${compact?'compact':''}" data-compare="${u.id}" aria-pressed="${on}" title="${on?'Remove from comparison':'Add to comparison'}"><span aria-hidden="true">${on?'✓':'＋'}</span>${compact?'':`<span>${on?'Comparing':'Compare'}</span>`}</button>`}
function updateSavedCounts(){
  const f=$('#favoriteCount'),c=$('#compareCount');if(f)f.textContent=state.favorites.size;if(c)c.textContent=state.compare.size;
  $('#compareBtn')?.classList.toggle('has-items',state.compare.size>0);
}
function refreshSelectionUI(){
  updateSavedCounts();renderTable();renderMarkers();renderCompare();
  if($('#detailDialog')?.open&&state.currentDetailId!=null)openDetail(state.currentDetailId);
}
function toggleFavorite(id){id=Number(id);if(state.favorites.has(id))state.favorites.delete(id);else state.favorites.add(id);saveSelections();if($('#favoritesOnly')?.checked)applyFilters();else refreshSelectionUI()}
function toggleCompare(id){
  id=Number(id);if(state.compare.has(id))state.compare.delete(id);else{if(state.compare.size>=6){alert('You can compare up to 6 universities at a time. Remove one before adding another.');return}state.compare.add(id)}
  saveSelections();refreshSelectionUI();
}
function wireSelectionControls(root=document){
  root.querySelectorAll?.('[data-favorite]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(b.dataset.favorite)}));
  root.querySelectorAll?.('[data-compare]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleCompare(b.dataset.compare)}));
}
function comparisonUrl(){const url=new URL(location.href);url.searchParams.delete('compare');if(state.compare.size)url.searchParams.set('compare',[...state.compare].join(','));url.hash='';return url.toString()}
async function shareComparison(){
  if(state.compare.size<2){const el=$('#compareShareStatus');if(el)el.textContent='Add at least two universities before sharing a comparison.';return}
  const url=comparisonUrl(),status=$('#compareShareStatus');try{await navigator.clipboard.writeText(url);if(status)status.textContent='Comparison link copied.'}catch{if(status)status.innerHTML=`Share this link: <a href="${esc(url)}">${esc(url)}</a>`}
}
function activeFilterDescriptors(){
  const out=[];
  const q=$('#search')?.value.trim();
  if(q)out.push({key:'search',label:`Search: “${q}”`});
  if($('#country')?.value)out.push({key:'country',label:`Country: ${selectedText('country')}`});
  if($('#continent')?.value)out.push({key:'continent',label:`Continent: ${selectedText('continent')}`});
  if($('#minPlaces')?.value&&$('#minPlaces').value!=='0')out.push({key:'minPlaces',label:`Places: ${selectedText('minPlaces')}`});
  if($('#historyWindow')?.value&&$('#historyWindow').value!=='5')out.push({key:'historyWindow',label:`History: ${selectedText('historyWindow')}`});
  if($('#demandLevel')?.value)out.push({key:'demandLevel',label:`Competitiveness: ${selectedText('demandLevel')}`});
  if($('#arwuMax')?.value&&$('#arwuMax').value!=='0')out.push({key:'arwuMax',label:`ARWU: ${selectedText('arwuMax')}`});
  if($('#minTemp')?.value!=='')out.push({key:'temperature',label:`Temperature · ${selectedText('tempMetric')}: ${selectedText('minTemp')}`});
  if($('#maxCost')?.value!=='')out.push({key:'maxCost',label:`Cost: ${selectedText('maxCost')}`});
  if($('#foundedBefore')?.value!=='')out.push({key:'foundedBefore',label:`University age: ${selectedText('foundedBefore')}`});
  if($('#myGpa')?.value!=='')out.push({key:'myGpa',label:`My GPA: ${selectedText('myGpa')}`});
  if($('#languageProof')?.value)out.push({key:'languageProof',label:`Language proof: ${selectedText('languageProof')}`});
  if($('#englishOnly')?.checked)out.push({key:'englishOnly',label:'English-only exchange possible'});
  if($('#housingFilter')?.value)out.push({key:'housingFilter',label:`Housing: ${selectedText('housingFilter')}`});
  if($('#academicStructure')?.value)out.push({key:'academicStructure',label:`Academic structure: ${selectedText('academicStructure')}`});
  if($('#favoritesOnly')?.checked)out.push({key:'favoritesOnly',label:'Favorites only'});
  return out;
}
function resetFilter(key){
  if(key==='search')$('#search').value='';
  else if(key==='country')$('#country').value='';
  else if(key==='continent')$('#continent').value='';
  else if(key==='minPlaces')$('#minPlaces').value='0';
  else if(key==='historyWindow')$('#historyWindow').value='5';
  else if(key==='demandLevel')$('#demandLevel').value='';
  else if(key==='arwuMax')$('#arwuMax').value='0';
  else if(key==='temperature'){ $('#minTemp').value=''; $('#tempMetric').value='AVG'; }
  else if(key==='maxCost')$('#maxCost').value='';
  else if(key==='foundedBefore')$('#foundedBefore').value='';
  else if(key==='myGpa')$('#myGpa').value='';
  else if(key==='languageProof')$('#languageProof').value='';
  else if(key==='englishOnly')$('#englishOnly').checked=false;
  else if(key==='housingFilter')$('#housingFilter').value='';
  else if(key==='academicStructure')$('#academicStructure').value='';
  else if(key==='favoritesOnly')$('#favoritesOnly').checked=false;
  applyFilters();
}
function resetAllFilters(){
  $('#search').value='';$('#country').value='';$('#continent').value='';$('#minPlaces').value='0';$('#historyWindow').value='5';$('#demandLevel').value='';$('#arwuMax').value='0';$('#tempMetric').value='AVG';$('#minTemp').value='';$('#maxCost').value='';$('#foundedBefore').value='';$('#myGpa').value='';$('#languageProof').value='';$('#englishOnly').checked=false;$('#housingFilter').value='';$('#academicStructure').value='';$('#favoritesOnly').checked=false;applyFilters();
}
function renderActiveFilters(){
  const box=$('#activeFilters'),items=activeFilterDescriptors(),count=$('#filterCount');
  if(count){count.textContent=items.length;count.setAttribute('aria-label',`${items.length} active filter${items.length===1?'':'s'}`);count.classList.toggle('has-filters',items.length>0)}
  if(!box)return;
  if(!items.length){box.hidden=true;box.innerHTML='';return}
  box.hidden=false;
  box.innerHTML=`<span class="active-filter-label">Active filters</span>${items.map(x=>`<button type="button" class="filter-chip" data-clear-filter="${esc(x.key)}"><span>${esc(x.label)}</span><b aria-hidden="true">×</b><span class="sr-only">Remove ${esc(x.label)}</span></button>`).join('')}<button type="button" class="clear-filter-chips" data-clear-all>Clear all</button>`;
  box.querySelectorAll('[data-clear-filter]').forEach(b=>b.addEventListener('click',()=>resetFilter(b.dataset.clearFilter)));
  box.querySelector('[data-clear-all]')?.addEventListener('click',resetAllFilters);
}

function competitionSummary(u){
  const years=selectedYears();
  // Recency-weighted categorical vote. In a five-year window the weights are
  // 5, 4, 3, 2, 1 from newest to oldest. This lets a consistent recent shift
  // outweigh older history, while one unusual year normally cannot dominate.
  const allObs=years.map((year,index)=>({
    year,
    status:u.history[year]?.status||'unknown',
    weight:years.length-index
  }));
  const obs=allObs.filter(x=>Number.isFinite(STATUS_META[x.status]?.order));
  if(!obs.length)return{status:'unknown',order:null,observed:0,selected:years.length,excluded:years.length,override:null,base:'unknown',counts:{},scores:{}};

  const counts={},scores={};
  for(const x of obs){
    counts[x.status]=(counts[x.status]||0)+1;
    scores[x.status]=(scores[x.status]||0)+x.weight;
  }

  // Plain majority is kept only so the UI can say when recency changed the result.
  const maxCount=Math.max(...Object.values(counts));
  const majorityCandidates=new Set(Object.keys(counts).filter(k=>counts[k]===maxCount));
  const base=obs.find(x=>majorityCandidates.has(x.status)).status;

  const maxScore=Math.max(...Object.values(scores));
  const weightedCandidates=new Set(Object.keys(scores).filter(k=>scores[k]===maxScore));
  // obs is newest -> oldest, so this also makes ties favor the most recent category.
  const status=obs.find(x=>weightedCandidates.has(x.status)).status;
  const override=status!==base?'recency_weighted':null;

  return{status,order:STATUS_META[status].order,observed:obs.length,selected:years.length,excluded:years.length-obs.length,override,base,counts,scores};
}
function availabilityInWindow(u){return selectedYears().filter(y=>u.history[y]?.status==='available').length}
function demandChip(status,label=null){const meta=STATUS_META[status]||STATUS_META.unknown;return `<span class="status-chip status-${esc(status)}">${esc(label||meta.short)}</span>`}
function summaryExplanation(s){
  if(s.status==='unknown')return 'No comparable CBS competitiveness observation in the selected period.';
  let text=`Recency-weighted classification: the newest selected year gets ${s.selected} point${s.selected===1?'':'s'}, then ${Math.max(1,s.selected-1)}, down to 1 for the oldest. The category with the highest total wins; ties favor the most recent year.`;
  if(s.override==='recency_weighted')text+=' Recent results changed the classification compared with a simple majority of years.';
  if(s.excluded)text+=` ${s.excluded} selected year${s.excluded===1?' was':'s were'} excluded because CBS recorded “No places” or “No data”.`;
  return text;
}
function markerIcon(u){const s=competitionSummary(u),m=STATUS_META[s.status]||STATUS_META.unknown;return L.divIcon({className:'',html:`<div class="uni-marker" style="background:${m.bg};border-color:${m.border}"></div>`,iconSize:[17,17],iconAnchor:[8,8]})}
function popupHtml(u){
  const c=state.climate.get(u.id),s=competitionSummary(u),avg=climateValue(c,'AVG'),fy=foundedYear(u),ci=costIndex(u);
  return `<div class="popup-name">${esc(u.name)}</div><div class="popup-meta"><span class="country-flag" aria-hidden="true">${countryFlag(u.country)}</span> ${esc(u.country)}${city(u)?` · ${esc(city(u))}`:''} · ${esc(continent(u))} · ${esc(windowLabel())}</div><div class="popup-facts"><div class="popup-demand">${demandChip(s.status)}</div><span>ARWU: <strong>${esc(rankText(u))}</strong></span>${Number.isFinite(avg)?`<span>Sep–Dec average: <strong>${tempText(avg)}</strong></span>`:''}${Number.isFinite(ci)?`<span>Cost: <strong>${esc(costVsDenmarkText(u))}</strong></span>`:''}${Number.isFinite(fy)?`<span>Founded: <strong>${fy}</strong></span>`:''}</div><div class="popup-actions"><button class="popup-btn" data-detail="${u.id}">View details</button>${favoriteButton(u,true)}${compareButton(u,true)}</div>`
}

function sortValue(u,key){
  if(key==='demandScore'){const s=competitionSummary(u);return s.order==null?99:s.order}
  if(key==='availabilityWindow')return availabilityInWindow(u);
  if(key==='costIndex')return costVsDenmark(u);
  if(key==='foundedYear')return foundedYear(u);
  if(key==='minGpa')return requirement(u)?.minGpa??null;
  if(key==='languageProof')return requirement(u)?.proofCategory||'';
  if(key.startsWith('temp')){const metric=key.slice(4);return climateValue(state.climate.get(u.id),metric)}
  return u[key];
}
function cmp(a,b,key,dir){let av=sortValue(a,key),bv=sortValue(b,key);const aNull=av==null||Number.isNaN(av),bNull=bv==null||Number.isNaN(bv);if(aNull&&bNull)return 0;if(aNull)return 1;if(bNull)return -1;if(typeof av==='string'||typeof bv==='string')return String(av).localeCompare(String(bv))*dir;return (av-bv)*dir}
function renderTable(){
  const body=$('#tableBody');if(!body)return;const rows=[...state.filtered].sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
  body.innerHTML=rows.map(u=>{const c=state.climate.get(u.id),s=competitionSummary(u),fy=foundedYear(u),age=yearsOld(fy),ci=costIndex(u),r=requirement(u);return `<tr><td><div class="uni-cell-head">${favoriteButton(u,true)}<button class="uni-link" data-detail="${u.id}">${esc(u.name)}</button></div><span class="muted">${esc(u.school||'Regular')}</span><div class="row-compare">${compareButton(u,false)}</div></td><td>${countryLineHtml(u.country)}<span class="city-line">${esc(city(u)||'—')}</span></td><td>${demandChip(s.status)}</td><td>${Number.isFinite(r?.minGpa)?r.minGpa.toFixed(1):'—'}</td><td><span class="muted">${esc(r?.matchStatus==='matched'?proofLabel(r.proofCategory):'No current MoveON match')}</span></td><td class="rank-cell ${u.arwuRank?'ranked':''}">${esc(rankText(u))}</td><td>${tempText(climateValue(c,'AVG'))}</td><td class="cost-cell">${Number.isFinite(ci)?`<strong>${esc(costVsDenmarkText(u))}</strong><span>${esc(costLevel(u))}</span>`:'—'}</td><td class="age-cell">${Number.isFinite(age)?`<strong>~${age} years</strong><span>Founded ${fy}</span>`:(profile(u)?'<span class="muted">Unknown</span>':'<span class="muted">Pending snapshot</span>')}</td><td>${u.latestPlaces??'—'}</td><td>${availabilityInWindow(u)}/${selectedYears().length}</td></tr>`}).join('');
  body.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail))));wireSelectionControls(body);
}
function renderMarkers(){
  layer.clearLayers();state.markers.clear();for(const u of state.filtered){const c=state.coords.get(u.id);if(!c)continue;const m=L.marker([c.lat,c.lon],{icon:markerIcon(u)}).bindPopup(popupHtml(u));m.on('popupopen',e=>{const root=e.popup.getElement();const btn=root?.querySelector('[data-detail]');if(btn)btn.onclick=()=>openDetail(Number(btn.dataset.detail));if(root)wireSelectionControls(root)});m.addTo(layer);state.markers.set(u.id,m)}
}
function updateLegend(){const el=$('#legendWindow');if(el)el.textContent=`Map colors · ${windowLabel()}`}
function applyFilters(){
  const q=$('#search').value.trim().toLowerCase(),country=$('#country').value,cont=$('#continent').value,minP=Number($('#minPlaces').value||0),demand=$('#demandLevel').value,favoritesOnly=$('#favoritesOnly')?.checked;
  const arwuMax=Number($('#arwuMax').value||0),tempMetric=$('#tempMetric').value,minTemp=$('#minTemp').value===''?null:Number($('#minTemp').value),maxCost=$('#maxCost').value===''?null:Number($('#maxCost').value),foundedBefore=$('#foundedBefore').value===''?null:Number($('#foundedBefore').value),myGpa=$('#myGpa').value===''?null:Number($('#myGpa').value),languageProof=$('#languageProof').value,englishOnly=$('#englishOnly').checked,housingFilter=$('#housingFilter').value,academicStructure=$('#academicStructure').value;
  state.filtered=state.all.filter(u=>{const c=state.climate.get(u.id),s=competitionSummary(u),tv=climateValue(c,tempMetric),ci=costVsDenmark(u),fy=foundedYear(u),r=requirement(u);return (!q||`${u.name} ${u.school} ${u.country} ${city(u)||''}`.toLowerCase().includes(q))&&(!country||u.country===country)&&(!cont||continent(u)===cont)&&(u.latestPlaces??0)>=minP&&(!demand||s.status===demand)&&(!favoritesOnly||state.favorites.has(u.id))&&(!arwuMax||(u.arwuSort&&u.arwuSort<=arwuMax))&&(minTemp==null||(Number.isFinite(tv)&&tv>=minTemp))&&(maxCost==null||(Number.isFinite(ci)&&ci<=maxCost))&&(foundedBefore==null||(Number.isFinite(fy)&&fy<foundedBefore))&&(myGpa==null||(Number.isFinite(r?.minGpa)&&r.minGpa<=myGpa))&&(!languageProof||r?.proofCategory===languageProof)&&(!englishOnly||r?.englishOnlyPossible==='yes')&&(!housingFilter||r?.onCampusHousing===housingFilter)&&(!academicStructure||r?.academicStructure===academicStructure)});
  $('#visibleCount').textContent=state.filtered.length;updateLegend();renderActiveFilters();renderMarkers();renderTable();renderCompare();updateSavedCounts();
}

function renderCompare(){
  const box=$('#compareContent');if(!box)return;const chosen=[...state.compare].map(id=>state.all.find(u=>u.id===id)).filter(Boolean);
  updateSavedCounts();
  if(!chosen.length){box.innerHTML=`<div class="compare-empty"><div class="compare-empty-icon">⇄</div><h3>No universities selected yet</h3><p>Use the <strong>Compare</strong> button next to a university on the map, list or detail view. You can compare up to six.</p></div>`;return}
  if(chosen.length===1){const u=chosen[0];box.innerHTML=`<div class="compare-empty"><div class="compare-one">${favoriteButton(u,true)}<strong>${esc(u.name)}</strong><span>${esc(u.country)}</span></div><h3>Add one more university</h3><p>A comparison becomes most useful with two or more universities.</p><button type="button" class="secondary-button" data-detail="${u.id}">View selected university</button></div>`;box.querySelector('[data-detail]')?.addEventListener('click',()=>openDetail(u.id));wireSelectionControls(box);return}
  const cell=u=>({
    demand:demandChip(competitionSummary(u).status),
    places:String(u.latestPlaces??'—'),
    avail:`${availabilityInWindow(u)}/${selectedYears().length}`,
    arwu:esc(rankText(u)),
    avg:tempText(climateValue(state.climate.get(u.id),'AVG')),
    sep:tempText(climateValue(state.climate.get(u.id),'SEP')),
    oct:tempText(climateValue(state.climate.get(u.id),'OCT')),
    nov:tempText(climateValue(state.climate.get(u.id),'NOV')),
    dec:tempText(climateValue(state.climate.get(u.id),'DEC')),
    cost:esc(costVsDenmarkText(u)),
    age:Number.isFinite(foundedYear(u))?`~${yearsOld(foundedYear(u))} years<br><span class="muted">Founded ${foundedYear(u)}</span>`:'—',
    gpa:Number.isFinite(requirement(u)?.minGpa)?requirement(u).minGpa.toFixed(1):'—',
    proof:esc(proofLabel(requirement(u)?.proofCategory||'unclear')),
    english:esc(englishCoursesLabel(requirement(u)?.englishCoursesCategory||'unclear')),
    otherLang:esc(nonEnglishLabel(requirement(u))),
    academic:esc(academicLabel(requirement(u)?.academicStructure||'unclear')),
    housing:esc(housingLabel(requirement(u)?.onCampusHousing||'unclear'))
  });
  const rows=[
    ['Location',u=>`${countryLineHtml(u.country)}${city(u)?`<span class="city-line">${esc(city(u))}</span>`:''}<span class="muted location-continent">${esc(continent(u))}</span>`],
    [`Competitiveness · ${windowLabel()}`,u=>cell(u).demand],
    ['CBS places 2026–27',u=>cell(u).places],
    [`Years with places available · ${windowLabel()}`,u=>cell(u).avail],
    ['ARWU 2026',u=>cell(u).arwu],
    ['Sep–Dec average',u=>cell(u).avg],
    ['September',u=>cell(u).sep],['October',u=>cell(u).oct],['November',u=>cell(u).nov],['December',u=>cell(u).dec],
    ['Cost vs Denmark',u=>cell(u).cost],['University age',u=>cell(u).age],
    ['Minimum CBS GPA',u=>cell(u).gpa],['Language proof',u=>cell(u).proof],['Courses in English',u=>cell(u).english],['Non-English language',u=>cell(u).otherLang],['Academic structure',u=>cell(u).academic],['On-campus housing',u=>cell(u).housing]
  ];
  box.innerHTML=`<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Criteria</th>${chosen.map(u=>`<th><div class="compare-university-head"><div class="compare-head-buttons">${favoriteButton(u,true)}<button type="button" class="remove-compare" data-compare="${u.id}" title="Remove from comparison">×</button></div><button class="compare-name" data-detail="${u.id}">${esc(u.name)}</button><span>${esc(u.school||u.country)}</span></div></th>`).join('')}</tr></thead><tbody>${rows.map(([label,fn])=>`<tr><th>${esc(label)}</th>${chosen.map(u=>`<td>${fn(u)}</td>`).join('')}</tr>`).join('')}<tr><th>Details</th>${chosen.map(u=>`<td><button type="button" class="secondary-button small" data-detail="${u.id}">View details</button></td>`).join('')}</tr></tbody></table></div>`;
  box.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail))));wireSelectionControls(box);
}

function climateDetails(c){if(!c)return `<p class="muted climate-wait">Climate snapshot pending for this location…</p>`;const avg=climateValue(c,'AVG');return `<div class="climate-summary"><strong>${tempText(avg)}</strong><span>Sep–Dec average</span></div><details class="month-breakdown"><summary>Monthly breakdown</summary><div class="climate-grid">${[['SEP','Sep'],['OCT','Oct'],['NOV','Nov'],['DEC','Dec']].map(([k,l])=>`<div class="climate-card"><span>${l}</span><strong>${tempText(c[k])}</strong></div>`).join('')}</div></details>`}
function costDetails(u){const ci=costIndex(u),pct=costVsDenmark(u);if(!Number.isFinite(ci))return `<strong>Cost comparison unavailable</strong><span class="muted">This country is not in the comparable Numbeo 2026 Mid-Year country table used here.</span>`;const raw=Math.round(Math.abs(pct));const comparison=raw<3?'About the same as Denmark':pct<0?`${raw}% cheaper than Denmark`:`${raw}% more expensive than Denmark`;return `<strong>${esc(comparison)}</strong><span class="muted">${esc(costLevel(u))}. Based on Numbeo's 2026 Mid-Year country Cost of Living + Rent Index: ${ci.toFixed(1)} for ${esc(u.country)} versus 54.8 for Denmark.</span><small>Country averages are a rough comparison, not a city-specific student budget.</small>`}
function historyProfileHtml(u){
  const p=profile(u),fy=foundedYear(u);
  if(!p)return `<div class="history-profile loading-profile"><strong>Profile snapshot pending</strong><span class="muted">The local university profile CSV has not been populated for this institution yet. The automatic data refresh can fill it.</span></div>`;
  const badge=heritageLabel(fy),links=[];
  if(p.officialWebsite)links.push(`<a class="secondary-button small" href="${esc(p.officialWebsite)}" target="_blank" rel="noopener">Official website ↗</a>`);
  if(p.officialHistoryUrl)links.push(`<a class="secondary-button small" href="${esc(p.officialHistoryUrl)}" target="_blank" rel="noopener">Official history / about ↗</a>`);
  const note=p.historyNote||`${u.name} is based in ${city(u)||u.country}. Additional official history information has not yet been added to the local snapshot.`;
  const src=p.historySource||p.metadataSource||'Local profile snapshot';
  return `<div class="history-profile"><div class="history-profile-head"><div><span class="mini-label">Founded / institution age</span><strong>${esc(ageText(fy))}</strong>${badge?`<span class="heritage-badge">${esc(badge)}</span>`:''}</div></div><p>${esc(note)}</p>${links.length?`<div class="profile-links" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">${links.join('')}</div>`:''}<small>Profile source: ${esc(src)}. Institution age does not guarantee that the exchange campus itself has old buildings.</small></div>`
}
function requirementsHtml(u){
  const r=requirement(u);
  if(!r||r.matchStatus!=='matched')return `<div class="section-head"><h3 class="section-title">CBS MoveON requirements</h3></div><div class="history-profile loading-profile"><strong>No current MoveON match</strong><span class="muted">This university is in the five-year CBS placement workbook but was not found in the current Regular / Undergraduate MoveON list checked on 21 September 2026. Requirements therefore cannot be shown reliably.</span></div>`;
  const gpa=Number.isFinite(r.minGpa)?r.minGpa.toFixed(1):'Not stated';
  const tests=[];if(Number.isFinite(r.ielts))tests.push(`IELTS ${r.ielts}`);if(Number.isFinite(r.toefl))tests.push(`TOEFL iBT ${r.toefl}`);if(Number.isFinite(r.cambridge))tests.push(`Cambridge ${r.cambridge}`);
  const langs=nonEnglishLabel(r);const sourceDate=r.sourceCheckedDate||'2026-09-21';
  return `<div class="section-head"><h3 class="section-title">CBS MoveON requirements</h3><span class="window-note">Snapshot checked ${esc(sourceDate)}</span></div>
  <div class="detail-metrics">
    <div class="metric-card"><span>Minimum GPA</span><strong>${esc(gpa)}</strong><small>Danish 7-point scale${r.minimumGpaRaw&&r.minimumGpaRaw!==gpa?` · MoveON: ${esc(r.minimumGpaRaw)}`:''}</small></div>
    <div class="metric-card"><span>Language proof</span><strong>${esc(proofLabel(r.proofCategory))}</strong>${tests.length?`<small>${esc(tests.join(' · '))}</small>`:''}${r.cbsLetterAccepted?'<small>CBS proficiency letter accepted</small>':''}</div>
    <div class="metric-card"><span>English-taught courses</span><strong>${esc(englishCoursesLabel(r.englishCoursesCategory))}</strong><small>English-only exchange possible: ${esc(englishOnlyLabel(r.englishOnlyPossible))}</small></div>
    <div class="metric-card"><span>Non-English language</span><strong>${esc(langs)}</strong>${r.languageLevels?`<small>${esc(r.languageLevels)}</small>`:''}</div>
  </div>
  <div class="detail-metrics">
    <div class="metric-card"><span>Academic structure</span><strong>${esc(academicLabel(r.academicStructure))}</strong><small>${esc(r.academicCalendarRaw||'No calendar note')}</small></div>
    <div class="metric-card"><span>Housing</span><strong>${esc(housingLabel(r.onCampusHousing))}</strong><small>${esc(r.housingRaw||'No housing note')}</small></div>
    <div class="metric-card"><span>Erasmus+</span><strong>${esc(r.erasmusPlus==='yes'?'Mentioned':'Not stated')}</strong><small>PIM: ${esc(r.pim==='yes'?'Yes':r.pim==='no'?'No':'Not stated')}</small></div>
    <div class="metric-card"><span>Source</span><strong>CBS MoveON</strong><a href="${esc(r.detailUrl)}" target="_blank" rel="noopener">Open current agreement ↗</a></div>
  </div>
  <div class="history-profile">
    ${r.languageRequirementsRaw?`<details class="month-breakdown"><summary>Full language requirements</summary><p>${esc(r.languageRequirementsRaw)}</p></details>`:''}
    ${r.coursesInEnglishRaw?`<details class="month-breakdown"><summary>English-course availability</summary><p>${esc(r.coursesInEnglishRaw)}</p></details>`:''}
    ${r.limitationsRaw?`<details class="month-breakdown"><summary>Limitations / restrictions</summary><p>${esc(r.limitationsRaw)}</p></details>`:''}
    ${r.courseAvailabilityRaw?`<details class="month-breakdown"><summary>Course availability</summary><p>${esc(r.courseAvailabilityRaw)}</p></details>`:''}
  </div>`;
}
function openDetail(id){
  const u=state.all.find(x=>x.id===id);if(!u)return;state.currentDetailId=id;const c=state.climate.get(u.id),s=competitionSummary(u),windowSet=new Set(selectedYears());
  const rankMeta=state.arwuReady?(u.arwuRank?`<strong>${esc(formatRank(u.arwuRank))}</strong>${u.arwuMatchedInstitution&&u.arwuMatchedInstitution!==u.name?`<span class="muted">ARWU institution: ${esc(u.arwuMatchedInstitution)}</span>`:''}`:`<strong>No confident ARWU match</strong><span class="muted">This avoids guessing when the CBS partner name cannot be matched confidently to the published ARWU list.</span>`):'<strong>Rank data loading…</strong>';
  const shift=s.override?'<span class="recent-shift">Recent years weighted more</span>':'';
  $('#detailContent').innerHTML=`<h2 class="detail-title">${esc(u.name)}</h2><p class="detail-sub"><span>${esc(u.school||'Regular')}</span><span class="meta-sep">·</span><span class="detail-country"><span class="country-flag" aria-hidden="true">${countryFlag(u.country)}</span>${esc(u.country)}</span>${city(u)?`<span class="meta-sep">·</span><span>${esc(city(u))}</span>`:''}<span class="meta-sep">·</span><span>${esc(continent(u))}</span></p><div class="detail-actions">${favoriteButton(u,false)}${compareButton(u,false)}</div>
    <div class="detail-metrics">
      <div class="metric-card"><span>Competitiveness · ${esc(windowLabel())}</span><div class="demand-summary">${demandChip(s.status)}${shift}</div><small>${s.observed}/${s.selected} selected years comparable</small></div>
      <div class="metric-card"><span>ARWU 2026</span>${rankMeta}<a href="https://www.shanghairanking.com/rankings/arwu/2026" target="_blank" rel="noopener">Source</a></div>
      <div class="metric-card climate-metric"><span>Exchange-period temperature</span>${climateDetails(c)}<small>NASA POWER 1991–2020 T2M climatology</small></div>
      <div class="metric-card"><span>Cost of living + rent</span>${costDetails(u)}<a href="${NUMBEO_URL}" target="_blank" rel="noopener">Numbeo source</a></div>
    </div>
    ${requirementsHtml(u)}
    <div class="section-head"><h3 class="section-title">History & character</h3><span class="window-note">Useful for finding older institutions; campus architecture can differ</span></div>
    ${historyProfileHtml(u)}
    <div class="section-head placement-head"><h3 class="section-title">CBS placement history</h3><span class="window-note">Highlighted years are used for the current map color</span></div>
    <div class="history">${YEARS.map(y=>{const h=u.history[y],st=h.status||'unknown';return `<div class="year-card status-${esc(st)} ${windowSet.has(y)?'':'outside-window'}"><strong>${y.replace('-','–')}</strong><b>${places(u,y)}</b><span class="year-status">${esc(STATUS_META[st]?.label||h.statusLabel||'Unknown')}</span></div>`}).join('')}</div>
    <p class="summary-explain"><strong>Overall for ${esc(windowLabel())}:</strong> ${esc(STATUS_META[s.status]?.short||'No comparable years')}. ${esc(summaryExplanation(s))}</p>`;
  wireSelectionControls($('#detailContent'));
  if(!$('#detailDialog').open)$('#detailDialog').showModal();
  if(!c)loadClimateForIds([u.id]).then(()=>{if($('#detailDialog').open&&state.currentDetailId===u.id)openDetail(u.id)}).catch(()=>{});
}

// Coordinates from Wikipedia, with a few city-level fallbacks for partner/campus names.
const coordKey='cbs-exchange-coords-v2';
function loadCached(){try{const c=JSON.parse(localStorage.getItem(coordKey)||'{}');for(const [id,v] of Object.entries(c))state.coords.set(Number(id),v)}catch{}for(const [id,c] of Object.entries(COORD_OVERRIDES))state.coords.set(Number(id),c)}
function saveCached(){try{localStorage.setItem(coordKey,JSON.stringify(Object.fromEntries(state.coords)))}catch{}}
async function wikiBatch(batch){const titles=batch.map(u=>u.lookupName).join('|');const url='https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=coordinates&colimit=max&titles='+encodeURIComponent(titles);const r=await fetch(url);if(!r.ok)throw new Error('Wikipedia coordinate lookup failed');const j=await r.json();const byTitle=new Map(batch.map(u=>[u.lookupName.toLowerCase(),u]));for(const p of Object.values(j.query?.pages||{})){if(!p.coordinates?.[0])continue;let u=byTitle.get((p.title||'').toLowerCase());if(!u)u=batch.find(x=>p.title?.toLowerCase().includes(x.lookupName.toLowerCase())||x.lookupName.toLowerCase().includes((p.title||'').toLowerCase()));if(u&&!COORD_OVERRIDES[u.id])state.coords.set(u.id,{lat:p.coordinates[0].lat,lon:p.coordinates[0].lon,source:'Wikipedia'})}}
async function wikiSearchOne(u){if(COORD_OVERRIDES[u.id])return;const query=`${u.lookupName} ${u.country}`;const surl='https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch='+encodeURIComponent(query)+'&prop=coordinates&colimit=max';try{const r=await fetch(surl);if(!r.ok)return;const j=await r.json();const p=Object.values(j.query?.pages||{})[0];if(p?.coordinates?.[0])state.coords.set(u.id,{lat:p.coordinates[0].lat,lon:p.coordinates[0].lon,source:'Wikipedia search'})}catch{}}
async function resolveCoordinates(){
  loadCached();renderMarkers();const missing=state.all.filter(u=>!state.coords.has(u.id));
  for(let i=0;i<missing.length;i+=40){try{await wikiBatch(missing.slice(i,i+40))}catch{}$('#geoStatus').textContent=`· locating universities ${Math.min(i+40,missing.length)}/${missing.length}`;renderMarkers()}
  const still=state.all.filter(u=>!state.coords.has(u.id));for(let i=0;i<still.length;i+=6){await Promise.all(still.slice(i,i+6).map(wikiSearchOne));$('#geoStatus').textContent=`· resolving ${Math.min(i+6,still.length)}/${still.length} unmatched`;renderMarkers()}
  for(const [id,c] of Object.entries(COORD_OVERRIDES))state.coords.set(Number(id),c);
  saveCached();const unresolved=state.all.length-state.coords.size;$('#geoStatus').textContent=`· ${state.coords.size} mapped${unresolved?` · ${unresolved} unresolved`:''}`;renderMarkers();loadClimateAll();
}

// NASA POWER 1991–2020 2 m air-temperature climatology. Requests are retried because the
// public endpoint can occasionally throttle or time out.
const climateKey='cbs-exchange-nasa-power-climate-v2-1991-2020';
function gridKey(c){const lat=Math.round(c.lat*2)/2,lon=Math.round(c.lon/0.625)*0.625;return `${lat.toFixed(3)},${lon.toFixed(3)}`}
function loadClimateCache(){try{const c=JSON.parse(localStorage.getItem(climateKey)||'{}');for(const [k,v] of Object.entries(c))state.gridClimate.set(k,v)}catch{}}
function saveClimateCache(){try{localStorage.setItem(climateKey,JSON.stringify(Object.fromEntries(state.gridClimate)))}catch{}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchGridClimate(c){
  const key=gridKey(c);if(state.gridClimate.has(key))return state.gridClimate.get(key);
  const url=`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=SB&longitude=${encodeURIComponent(c.lon)}&latitude=${encodeURIComponent(c.lat)}&format=JSON&start=1991&end=2020`;
  let lastErr=null;for(let attempt=0;attempt<3;attempt++){try{const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),15000);const r=await fetch(url,{signal:ctl.signal,cache:'no-store'});clearTimeout(timer);if(!r.ok)throw new Error(`NASA POWER ${r.status}`);const j=await r.json();const p=j?.properties?.parameter?.T2M;if(!p)throw new Error('No T2M climate data');const v={SEP:Number(p.SEP),OCT:Number(p.OCT),NOV:Number(p.NOV),DEC:Number(p.DEC)};if(!Object.values(v).every(Number.isFinite))throw new Error('Incomplete climate data');state.gridClimate.set(key,v);return v}catch(e){lastErr=e;await wait(350*(attempt+1))}}throw lastErr||new Error('Climate request failed');
}
function refreshDataStatus(){
  const arwu=state.arwuReady?`ARWU: ${state.arwuRankedCount} local matches · ${state.arwuPendingCount} no confident match`:'ARWU: loading local snapshot';
  const climate=state.climateLoading?`Climate: ${state.climate.size}/${state.all.length} local/loaded · filling missing values`:`Climate: ${state.climate.size}/${state.all.length} local/loaded`;
  const hist=`Profiles: ${state.profiles.size}/${state.all.length} local`;
  const req=`MoveON: ${[...state.requirements.values()].filter(x=>x.matchStatus==='matched').length}/${state.all.length} current matches`;
  $('#dataStatus').textContent=`${arwu} · ${climate} · ${hist} · ${req}`;
}
async function loadClimateForIds(ids){const groups=new Map();for(const id of ids){if(state.climate.has(id))continue;const c=state.coords.get(id);if(!c)continue;const k=gridKey(c);if(!groups.has(k))groups.set(k,{c,ids:[]});groups.get(k).ids.push(id)}for(const g of groups.values()){try{const v=await fetchGridClimate(g.c);for(const id of g.ids)state.climate.set(id,v)}catch(e){console.warn('Climate unavailable for',g.ids,e)}}saveClimateCache();renderTable();renderMarkers();refreshDataStatus()}
async function loadClimateAll(){
  if(state.climateLoading)return;loadClimateCache();const groups=new Map();for(const u of state.all){if(state.climate.has(u.id))continue;const c=state.coords.get(u.id);if(!c)continue;const k=gridKey(c);if(!groups.has(k))groups.set(k,{c,ids:[]});groups.get(k).ids.push(u.id)}
  for(const g of groups.values()){const cached=state.gridClimate.get(gridKey(g.c));if(cached)for(const id of g.ids)state.climate.set(id,cached)}
  const pending=[...groups.values()].filter(g=>!state.gridClimate.has(gridKey(g.c)));state.climateLoading=true;state.climateDone=groups.size-pending.length;state.climateTotal=groups.size;refreshDataStatus();renderTable();let next=0;
  async function worker(){while(next<pending.length){const i=next++,g=pending[i];try{const v=await fetchGridClimate(g.c);for(const id of g.ids)state.climate.set(id,v)}catch(e){console.warn('Climate unavailable for',g.ids,e)}state.climateDone++;if(state.climateDone%5===0||state.climateDone===state.climateTotal){saveClimateCache();refreshDataStatus();applyFilters()}await wait(120)}}
  await Promise.all(Array.from({length:Math.min(3,pending.length||1)},worker));state.climateLoading=false;saveClimateCache();refreshDataStatus();applyFilters();
}

// University profiles are loaded from data/university_profiles.csv.
function rankLower(rank){if(!rank)return null;const m=String(rank).match(/\d+/);return m?Number(m[0]):null}
async function loadArwu(){
  let rows=[];try{rows=await csvObjects('data/arwu_2026.csv')}catch(e){console.warn('ARWU CSV unavailable',e)}
  const byId=new Map(rows.map(r=>[Number(r.university_id),r]));let ranked=0,unmatched=0;
  for(const u of state.all){const x=byId.get(u.id);const rank=(x?.rank||'').trim();u.arwuRank=rank||null;u.arwuSort=rankLower(rank);u.arwuMatchedInstitution=(x?.matched_institution||'').trim()||null;u.arwuPending=false;u.arwuUnmatched=!u.arwuRank;if(u.arwuRank)ranked++;else unmatched++}
  state.arwuRankedCount=ranked;state.arwuPendingCount=unmatched;state.arwuReady=true;refreshDataStatus();
}

function parseCsvRows(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===','){row.push(cell);cell=''}
      else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell=''}
      else if(ch!=='\r')cell+=ch;
    }
  }
  if(cell.length||row.length){row.push(cell);rows.push(row)}
  return rows;
}
function csvObjectsFromText(text){
  const rows=parseCsvRows(String(text||'').replace(/^\uFEFF/,''));if(rows.length<1)return [];
  const headers=rows[0].map(x=>x.trim());return rows.slice(1).filter(r=>r.some(x=>String(x).trim()!=='')).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])));
}
async function csvObjects(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);return csvObjectsFromText(await r.text())}
function boolCsv(v){return String(v).trim().toLowerCase()==='true'}
function numCsv(v){const n=Number(v);return String(v).trim()!==''&&Number.isFinite(n)?n:null}

async function loadCoreUniversities(){
  const [urows,hrows]=await Promise.all([csvObjects('data/universities.csv'),csvObjects('data/cbs_history.csv')]);
  const hist=new Map();for(const r of hrows){const id=Number(r.university_id);if(!hist.has(id))hist.set(id,{});const places=numCsv(r.places);hist.get(id)[r.year]={places,available:boolCsv(r.available),noPlaces:boolCsv(r.no_places),noData:boolCsv(r.no_data),status:r.status||'unknown',statusLabel:r.status_label||'',excelColor:r.excel_color||null}}
  return urows.map(r=>{const id=Number(r.id),history=hist.get(id)||{},availabilityYears=Object.values(history).filter(h=>h.available).length;return {id,country:r.country,name:r.university,lookupName:r.lookup_name||r.university,school:r.school||'Regular',rawName:r.university,level:r.level||'UG',availabilityYears,availableLast2:boolCsv(r.available_last2),latestPlaces:numCsv(r.latest_places),history,latestStatus:history['2026-2027']?.status||'unknown'}});
}

async function loadUniversityLocations(){
  try{
    const rows=await csvObjects('data/university_locations.csv'),byId=new Map(rows.map(r=>[Number(r.id),r]));
    for(const u of state.all){const x=byId.get(u.id);if(!x)continue;if((x.city||'').trim())u.city=x.city.trim();if((x.continent||'').trim())u.continent=x.continent.trim();const lat=numCsv(x.latitude),lon=numCsv(x.longitude);if(Number.isFinite(lat)&&Number.isFinite(lon))state.coords.set(u.id,{lat,lon,source:x.location_source||'local CSV'})}
  }catch(e){console.warn('University location CSV unavailable',e)}
}
async function loadStaticClimate(){
  try{const rows=await csvObjects('data/climate.csv');for(const r of rows){const id=Number(r.university_id),v={SEP:numCsv(r.sep_c),OCT:numCsv(r.oct_c),NOV:numCsv(r.nov_c),DEC:numCsv(r.dec_c)};if(Number.isFinite(id)&&Object.values(v).every(Number.isFinite))state.climate.set(id,v)}}catch(e){console.warn('Climate CSV unavailable',e)}
}
async function loadStaticProfiles(){
  try{const rows=await csvObjects('data/university_profiles.csv');for(const r of rows){const id=Number(r.university_id),fy=numCsv(r.founded_year),p={foundedYear:fy,officialWebsite:(r.official_website||'').trim()||null,officialHistoryUrl:(r.official_history_url||'').trim()||null,historyNote:(r.history_note||'').trim()||null,metadataSource:(r.metadata_source||'').trim()||null,historySource:(r.history_source||'').trim()||null,qid:(r.wikidata_qid||'').trim()||null};if(Number.isFinite(id)&&(Number.isFinite(fy)||p.officialWebsite||p.historyNote))state.profiles.set(id,p)}}catch(e){console.warn('University profile CSV unavailable',e)}
}
async function loadStaticRequirements(){
  try{const rows=await csvObjects('data/partner_requirements.csv');for(const r of rows){const id=Number(r.university_id);if(!Number.isFinite(id))continue;state.requirements.set(id,{matchStatus:r.match_status||'unclear',moveonUniversity:r.moveon_university||'',coreId:r.core_id||'',relationId:r.relation_id||'',detailUrl:r.moveon_detail_url||'',minGpa:numCsv(r.minimum_gpa_danish7),minimumGpaRaw:r.minimum_gpa_raw||'',academicStructure:r.academic_structure||'unclear',academicCalendarRaw:r.academic_calendar_raw||'',workExperience:r.work_experience_required||'unclear',languageInstructionRaw:r.language_of_instruction_raw||'',englishCoursesCategory:r.courses_in_english_category||'unclear',coursesInEnglishRaw:r.courses_in_english_raw||'',proofCategory:r.language_proof_category||'unclear',proofRaw:r.proof_of_language_raw||'',languageRequirementsRaw:r.language_requirements_raw||'',englishOnlyPossible:r.english_only_possible||'unclear',nonEnglishRequirement:r.non_english_requirement||'unclear',nonEnglishLanguages:r.non_english_languages||'',languageLevels:r.language_levels||'',cbsLetterAccepted:boolCsv(r.cbs_letter_accepted),ielts:numCsv(r.ielts_overall_min),toefl:numCsv(r.toefl_ibt_overall_min),cambridge:numCsv(r.cambridge_overall_min),onCampusHousing:r.on_campus_housing||'unclear',housingRaw:r.housing_raw||'',erasmusPlus:r.erasmus_plus||'unclear',pim:r.pim||'unclear',limitationsRaw:r.limitations_raw||'',courseAvailabilityRaw:r.course_availability_raw||'',programInformationRaw:r.program_information_raw||'',additionalInformationRaw:r.additional_information_raw||'',infoAboutUniversityRaw:r.info_about_university_raw||'',visaRaw:r.visa_raw||'',sourceCheckedDate:r.source_checked_date||''})}}catch(e){console.warn('MoveON requirements CSV unavailable',e)}
}
async function loadStaticCost(){
  try{const rows=await csvObjects('data/cost_of_living.csv');for(const r of rows){const index=numCsv(r.cost_rent_index),denmark=numCsv(r.denmark_index),pct=numCsv(r.percent_vs_denmark);state.costByCountry.set(r.country,{index,denmark,pct,source:r.source_url||NUMBEO_URL,snapshot:r.snapshot||''})}}catch(e){console.warn('Cost CSV unavailable',e)}
}

async function init(){
  state.all=await loadCoreUniversities();
  await Promise.all([loadUniversityLocations(),loadStaticClimate(),loadStaticProfiles(),loadStaticCost(),loadStaticRequirements()]);
  await loadArwu();state.filtered=[...state.all];loadSavedSelections();
  const validIds=new Set(state.all.map(u=>u.id));state.favorites=new Set([...state.favorites].filter(id=>validIds.has(id)));state.compare=new Set([...state.compare].filter(id=>validIds.has(id)).slice(0,6));saveSelections();
  const countries=[...new Set(state.all.map(u=>u.country))].sort();$('#totalCount').textContent=state.all.length;$('#countryCount').textContent=countries.length;
  const countrySelect=$('#country');countrySelect.innerHTML='<option value="">All countries</option>'+countries.map(c=>`<option value="${esc(c)}">${countryFlag(c)} ${esc(c)}</option>`).join('');
  const continentSelect=$('#continent'),validContinents=new Set(state.all.map(continent));for(const opt of [...continentSelect.options])if(opt.value&&!validContinents.has(opt.value))opt.remove();
  for(const el of ['search','country','continent','minPlaces','historyWindow','demandLevel','arwuMax','tempMetric','minTemp','maxCost','foundedBefore','myGpa','languageProof','englishOnly','housingFilter','academicStructure','favoritesOnly'])$('#'+el).addEventListener(el==='search'?'input':'change',applyFilters);
  $('#reset').addEventListener('click',resetAllFilters);$('#favoritesQuick').addEventListener('click',()=>{$('#favoritesOnly').checked=true;applyFilters();switchView('list')});$('#shareCompare').addEventListener('click',shareComparison);$('#clearCompare').addEventListener('click',()=>{state.compare.clear();saveSelections();renderCompare();updateSavedCounts()});
  document.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.sort;if(state.sortKey===k)state.sortDir*=-1;else{state.sortKey=k;state.sortDir=(k==='name'||k==='country'||k==='arwuSort'||k==='demandScore'||k==='costIndex'||k==='foundedYear'||k==='minGpa'||k==='languageProof')?1:-1}renderTable()}));
  $('#mapBtn').addEventListener('click',()=>switchView('map'));$('#listBtn').addEventListener('click',()=>switchView('list'));$('#compareBtn').addEventListener('click',()=>switchView('compare'));$('#closeDialog').addEventListener('click',()=>{$('#detailDialog').close();state.currentDetailId=null});
  const filterMenu=$('#filterMenu');
  document.addEventListener('pointerdown',e=>{if(filterMenu?.open&&!filterMenu.contains(e.target))filterMenu.open=false});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&filterMenu?.open){filterMenu.open=false;e.stopPropagation()}});
  $('#foundedBefore').disabled=state.profiles.size===0;updateSavedCounts();applyFilters();refreshDataStatus();
  const unresolved=state.all.length-state.coords.size;$('#geoStatus').textContent=`· ${state.coords.size} mapped${unresolved?` · ${unresolved} unresolved`:''}`;
  // Static CSVs are primary. These fallbacks only fill gaps until the repository refresh workflow has populated all snapshots.
  if(unresolved)resolveCoordinates();else if(state.climate.size<state.all.length)loadClimateAll();
  if(new URLSearchParams(location.search).has('compare')&&state.compare.size)switchView('compare');
}
function switchView(v){const isMap=v==='map',isList=v==='list',isCompare=v==='compare';$('#mapView').classList.toggle('active',isMap);$('#listView').classList.toggle('active',isList);$('#compareView').classList.toggle('active',isCompare);$('#mapBtn').classList.toggle('active',isMap);$('#listBtn').classList.toggle('active',isList);$('#compareBtn').classList.toggle('active',isCompare);if(isMap)setTimeout(()=>map.invalidateSize(),50);if(isCompare)renderCompare()}
init().catch(e=>{$('#geoStatus').textContent='· could not load dataset';console.error(e)});
