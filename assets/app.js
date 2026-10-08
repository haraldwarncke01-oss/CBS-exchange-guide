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
function universityNameKey(u){return `${u.country}||${u.name}`.toLowerCase()}
function isMultiAgreement(u){return (state.nameCounts.get(universityNameKey(u))||0)>1}
function listUniversityTitle(u){return isMultiAgreement(u)&&u.school&&u.school!=='Regular'?`${u.name} — ${u.school}`:u.name}

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

// City, continent and map coordinates are loaded from data/university_locations.csv.
// Climate normals are loaded from the local data/climate.csv snapshot.

const state={
  all:[],filtered:[],coords:new Map(),markers:new Map(),climate:new Map(),costByCountry:new Map(),requirements:new Map(),universityHistory:new Map(),
  courseApprovals:new Map(),creditWorkloads:new Map(),coursePrograms:[],courseApprovalSource:null,creditSource:null,
  favorites:new Set(),compare:new Set(),
  arwuReady:false,arwuRankedCount:0,arwuPendingCount:0,nameCounts:new Map(),sortKey:'demandScore',sortDir:1,
  currentDetailId:null
};
const $=s=>document.querySelector(s);

const ANALYTICS_APP='cbs_exchange_explorer';
function analyticsCapture(event,properties={}){
  try{
    if(window.posthog?.capture)window.posthog.capture(event,{app:ANALYTICS_APP,...properties});
  }catch(e){console.warn('Analytics capture failed',e)}
}
function analyticsUniversityProps(u,extra={}){
  if(!u)return extra;
  const r=requirement(u);
  return {
    university_id:u.id,
    university_name:u.name,
    country:u.country,
    city:city(u)||'',
    school:u.school||'Regular',
    continent:continent(u),
    places_2026_27:Number.isFinite(u.latestPlaces)?u.latestPlaces:null,
    fall_2027_places:Number.isFinite(r?.fall2027Places)?r.fall2027Places:null,
    ...extra
  };
}
function interactionSource(el){
  if(!el?.closest)return 'unknown';
  if(el.closest('#detailContent'))return 'detail';
  if(el.closest('#compareContent'))return 'compare';
  if(el.closest('.leaflet-popup'))return 'map';
  if(el.closest('.university-table'))return 'list';
  return 'unknown';
}

const FILTER_ANALYTICS_LABELS={
  country:'Country',
  continent:'Continent',
  minPlaces:'Minimum 2026–27 places',
  minPlaces2027:'Minimum Fall 2027 places',
  placesChange:'2027 vs 2026–27 places',
  historyWindow:'History window',
  availabilityMin:'Historical availability',
  demandLevel:'2026/27 status',
  arwuMax:'ARWU rank',
  foundedBefore:'Founded before',
  tempMetric:'Temperature metric',
  minTemp:'Minimum temperature',
  maxCost:'Cost vs Denmark',
  myGpa:'My GPA',
  languageProof:'Language requirement',
  englishEvidence:'English proof I can use',
  gymEnglishLevel:'Gymnasium English level',
  gymEnglishGrade:'Gymnasium English grade',
  englishOnly:'English-only exchange',
  housingFilter:'Housing',
  academicStructure:'Academic structure',
  favoritesOnly:'Favorites only'
};
const SORT_ANALYTICS_LABELS={
  name:'University',
  country:'Country / city',
  fall2027Places:'Fall 2027 places',
  latestPlaces:'Places 2026/27',
  placesDelta:'Change 2027 vs 2026/27',
  availabilityWindow:'Years with leftover places',
  demandScore:'Competitiveness',
  minGpa:'Minimum GPA',
  languageProof:'Language requirement',
  englishEvidence:'English proof I can use',
  gymEnglishLevel:'Gymnasium English level',
  gymEnglishGrade:'Gymnasium English grade',
  arwuSort:'ARWU',
  temp:'Sep–Dec temperature',
  costIndex:'Cost vs Denmark'
};
function analyticsFilterValue(el){
  if(!el)return null;
  if(el.type==='checkbox')return !!el.checked;
  return el.value===''?'all':el.value;
}
function analyticsFilterDisplay(el){
  if(!el)return '';
  if(el.type==='checkbox')return el.checked?'On':'Off';
  return el.selectedOptions?.[0]?.textContent?.trim()||String(el.value||'All');
}
function activeFilterCount(){
  let n=0;
  for(const id of Object.keys(FILTER_ANALYTICS_LABELS)){
    const el=$('#'+id);if(!el)continue;
    if(id==='tempMetric')continue;
    if(el.type==='checkbox'){if(el.checked)n++;continue}
    if(id==='historyWindow'){if(el.value&&el.value!=='5')n++;continue}
    if(el.value&&el.value!=='0')n++;
  }
  if($('#search')?.value.trim())n++;
  return n;
}
function trackFilterChanged(el){
  if(!el)return;
  analyticsCapture('filter_changed',{
    filter_id:el.id,
    filter_name:FILTER_ANALYTICS_LABELS[el.id]||el.id,
    filter_value:analyticsFilterValue(el),
    filter_display:analyticsFilterDisplay(el),
    active_filter_count:activeFilterCount(),
    result_count:state.filtered.length
  });
}
let searchAnalyticsTimer=null;
function scheduleSearchAnalytics(){
  clearTimeout(searchAnalyticsTimer);
  searchAnalyticsTimer=setTimeout(()=>{
    const q=$('#search')?.value||'';
    analyticsCapture('filter_changed',{
      filter_id:'search',
      filter_name:'Search',
      filter_value:q.trim()?'used':'cleared',
      search_query_length:q.trim().length,
      active_filter_count:activeFilterCount(),
      result_count:state.filtered.length
    });
  },700);
}

let detailEngagement=null;
function engagementNow(){return performance?.now?.()??Date.now()}
function startDetailEngagement(u,source='unknown'){
  if(!u)return;
  if(detailEngagement)finishDetailEngagement('replaced');
  detailEngagement={
    universityId:u.id,
    source,
    startedAt:engagementNow(),
    accumulatedMs:0
  };
}
function pauseDetailEngagement(){
  if(!detailEngagement||detailEngagement.startedAt==null)return;
  detailEngagement.accumulatedMs+=Math.max(0,engagementNow()-detailEngagement.startedAt);
  detailEngagement.startedAt=null;
}
function resumeDetailEngagement(){
  if(!detailEngagement||detailEngagement.startedAt!=null)return;
  if($('#detailDialog')?.open&&state.currentDetailId===detailEngagement.universityId){
    detailEngagement.startedAt=engagementNow();
  }
}
function engagementBucket(seconds){
  if(seconds<5)return '<5s';
  if(seconds<15)return '5–14s';
  if(seconds<30)return '15–29s';
  if(seconds<60)return '30–59s';
  if(seconds<120)return '1–2m';
  if(seconds<300)return '2–5m';
  return '5m+';
}
function finishDetailEngagement(reason='closed'){
  if(!detailEngagement)return;
  pauseDetailEngagement();
  const session=detailEngagement;
  detailEngagement=null;
  const u=state.all.find(x=>x.id===session.universityId);
  const seconds=Math.max(0,session.accumulatedMs/1000);
  analyticsCapture('university_detail_engagement',analyticsUniversityProps(u,{
    source:session.source,
    close_reason:reason,
    engagement_seconds:Number(seconds.toFixed(1)),
    engagement_bucket:engagementBucket(seconds),
    favorited_at_close:u?isFavorite(u.id):false,
    compared_at_close:u?isCompared(u.id):false
  }));
}

const map=L.map('map',{worldCopyJump:true,minZoom:2}).setView([20,8],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
const layer=L.layerGroup().addTo(map);

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function selectedYears(){const n=Number($('#historyWindow')?.value||5);return YEARS.slice(0,n)}
function windowLabel(){const n=Number($('#historyWindow')?.value||5);return n===1?'2026–27 only':n===5?'all 5 years':`last ${n} years`}
function places(u,y){const h=u.history[y],v=h?.places;return v==null?(h?.noPlaces?'—':h?.noData?'—':'?'):v}
function tempText(v){return Number.isFinite(v)?`${v.toFixed(1)}°C`:'…'}
function climateValue(c,key){if(!c)return null;if(key==='AVG'){const vals=['SEP','OCT','NOV','DEC'].map(k=>c[k]).filter(Number.isFinite);return vals.length===4?vals.reduce((a,b)=>a+b,0)/4:null}return Number.isFinite(c[key])?c[key]:null}
const CLIMATE_MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const CLIMATE_MONTH_LABEL={JAN:'Jan',FEB:'Feb',MAR:'Mar',APR:'Apr',MAY:'May',JUN:'Jun',JUL:'Jul',AUG:'Aug',SEP:'Sep',OCT:'Oct',NOV:'Nov',DEC:'Dec'};
const MONTH_KEY={January:'JAN',February:'FEB',March:'MAR',April:'APR',May:'MAY',June:'JUN',July:'JUL',August:'AUG',September:'SEP',October:'OCT',November:'NOV',December:'DEC'};
function calendarMonthKeys(start,end){const a=CLIMATE_MONTHS.indexOf(MONTH_KEY[start]),b=CLIMATE_MONTHS.indexOf(MONTH_KEY[end]);if(a<0||b<0)return [];return a<=b?CLIMATE_MONTHS.slice(a,b+1):CLIMATE_MONTHS.slice(a).concat(CLIMATE_MONTHS.slice(0,b+1))}
function fallPeriodFor(u){const r=requirement(u);if(!r||r.fallPeriodStatus!=='parsed')return null;const months=calendarMonthKeys(r.fallStartMonth,r.fallEndMonth);return months.length?{months,label:r.fallPeriodLabel||`${r.fallStartMonth}–${r.fallEndMonth}`} : null}
function detailClimatePeriod(u,c){if(!c)return null;const p=fallPeriodFor(u);if(p&&p.months.every(k=>Number.isFinite(c[k]))){const vals=p.months.map(k=>c[k]);return {months:p.months,label:p.label,avg:vals.reduce((a,b)=>a+b,0)/vals.length,calendarBased:true}}const months=['SEP','OCT','NOV','DEC'];const vals=months.map(k=>c[k]);if(vals.every(Number.isFinite))return {months,label:'September–December',avg:vals.reduce((a,b)=>a+b,0)/vals.length,calendarBased:false};return null}
function formatRank(rank){const s=String(rank||'');return /^\d+$/.test(s)?`#${s}`:s.replace('-', '–')}
function rankText(u){if(!state.arwuReady)return '…';if(u.arwuRank)return formatRank(u.arwuRank);if(u.arwuStatus==='not_top_1000')return 'Not in top 1000';return 'No verified ARWU match'}
const INFO_CONTENT={
  competitiveness:{
    title:'CBS competitiveness',
    body:`This is based on the colors in CBS's historical placement workbook. The categories are treated as an ordered scale: Places available → All places filled → Competitive → Very competitive. Newer years count more than older years, and the site uses a recency-weighted median. This means green, yellow and purple all reinforce the fact that places filled up instead of being treated as unrelated categories.`
  },
  arwu:{
    title:'ARWU 2026',
    body:`ARWU is ShanghaiRanking's Academic Ranking of World Universities. More than 2,500 universities are evaluated and the best 1,000 are published. It is mainly a research ranking, using Nobel/Fields alumni and staff, highly cited researchers, Nature/Science papers, indexed research papers and per-capita academic performance. This site has been checked against all 1,000 institutions in the official 2026 list. Exact ranks are shown where published; beyond the exact-ranking range, ShanghaiRanking publishes bands such as 101–150 or 401–500, which are kept as bands. CBS partners absent from the published list are shown as “Not in top 1000”.`,
    link:'https://www.shanghairanking.com/methodology/arwu/2026',
    linkLabel:'ARWU methodology'
  },
  climate:{
    title:'Exchange-period temperature',
    body:`In university details, the headline temperature follows the Fall exchange period stated in CBS MoveON when that calendar can be parsed reliably. Map, list and filter comparisons continue to use September–December so every destination is compared on the same four-month window. The values are 1991–2020 climate normals for 2-metre air temperature from NASA POWER, using the university or city coordinates. They describe typical climate, not the weather in a specific exchange year.`,
    link:'https://power.larc.nasa.gov/',
    linkLabel:'NASA POWER'
  },
  history:{
    title:'University founding year',
    body:`Founding years are stored locally and linked to a source. Official university history/about pages are preferred; CBS MoveON university profiles are used only when they explicitly state the date. The founding-year filter uses the sourced founding year shown in each university record.`
  },
  cost:{
    title:'Cost of living + rent',
    body:`This compares Numbeo's 2026 Mid-Year country-level Cost of Living + Rent Index with Denmark. “30% cheaper than Denmark” means the country's index is about 30% lower than Denmark's index. It is a broad country comparison — not a city-specific student budget — so rent and daily costs in the actual university city can differ substantially.`,
    link:'https://www.numbeo.com/cost-of-living/rankings_by_country_result.jsp',
    linkLabel:'Numbeo source'
  }
};
function infoButton(key,label='More information'){return `<button class="info-button" type="button" data-info="${esc(key)}" aria-label="${esc(label)}" aria-expanded="false">i</button>`}
function arwuRankNote(rank){const s=String(rank||'');if(!s)return '';return /^\d+$/.test(s)?'Official world rank':'Official ARWU rank band'}
function metricLabel(text,key){return `<div class="metric-label-row"><span>${esc(text)}</span>${infoButton(key,`About ${text}`)}</div>`}
let activeInfoButton=null;
function closeInfoPopover(){
  const pop=$('#infoPopover');if(!pop)return;
  pop.hidden=true;pop.innerHTML='';
  if(activeInfoButton){activeInfoButton.setAttribute('aria-expanded','false');activeInfoButton=null}
}
function positionInfoPopover(button){
  const pop=$('#infoPopover');if(!pop||pop.hidden)return;
  const rect=button.getBoundingClientRect(),margin=12;
  const width=Math.min(350,window.innerWidth-margin*2);
  pop.style.width=`${width}px`;
  const left=Math.max(margin,Math.min(window.innerWidth-width-margin,rect.left+rect.width/2-width/2));
  pop.style.left=`${left}px`;
  let top=rect.bottom+9;
  const h=pop.offsetHeight;
  if(top+h>window.innerHeight-margin)top=Math.max(margin,rect.top-h-9);
  pop.style.top=`${top}px`;
}
function openInfoPopover(button,key){
  const data=INFO_CONTENT[key];if(!data)return;
  if(activeInfoButton===button&&!$('#infoPopover').hidden){closeInfoPopover();return}
  closeInfoPopover();
  activeInfoButton=button;button.setAttribute('aria-expanded','true');
  const pop=$('#infoPopover');
  // Native <dialog> elements live in the browser top layer. A fixed popover that remains
  // outside an open modal can render behind the dialog/backdrop even with a huge z-index.
  // Move the shared popover into the active dialog when the info button is inside it.
  const dialog=button.closest('dialog');
  const host=dialog||document.body;
  if(pop.parentElement!==host)host.appendChild(pop);
  pop.innerHTML=`<div class="info-popover-head"><strong>${esc(data.title)}</strong><button type="button" class="info-popover-close" aria-label="Close information">×</button></div><p>${esc(data.body)}</p>${data.link?`<a href="${esc(data.link)}" target="_blank" rel="noopener">${esc(data.linkLabel)} ↗</a>`:''}`;
  pop.hidden=false;positionInfoPopover(button);
  pop.querySelector('.info-popover-close')?.addEventListener('click',closeInfoPopover);
}

function continent(u){return u.continent||CONTINENT_BY_COUNTRY[u.country]||'Other'}
function costIndex(u){const row=state.costByCountry.get(u.country);const v=row?.index;return Number.isFinite(v)?v:null}
function costVsDenmark(u){const row=state.costByCountry.get(u.country);if(Number.isFinite(row?.pct))return row.pct;const v=costIndex(u),dk=Number.isFinite(row?.denmark)?row.denmark:DENMARK_COST_RENT_2026;return Number.isFinite(v)&&Number.isFinite(dk)?((v/dk)-1)*100:null}
function costVsDenmarkText(u){const pct=costVsDenmark(u);if(!Number.isFinite(pct))return '—';const n=Math.round(Math.abs(pct));if(n<3)return 'About the same as Denmark';return pct<0?`${n}% cheaper than Denmark`:`${n}% more expensive than Denmark`}
function costLevel(u){const pct=costVsDenmark(u);if(!Number.isFinite(pct))return '';if(pct<=-35)return 'Much cheaper';if(pct<=-15)return 'Cheaper';if(pct<15)return 'Similar';if(pct<35)return 'More expensive';return 'Much more expensive'}
function city(u){return u.city||null}
function requirement(u){return state.requirements.get(u.id)||null}
function courseApprovalData(u){return state.courseApprovals.get(u.id)||null}
function creditWorkloadData(u){return state.creditWorkloads.get(u.id)||null}
const courseProgramKey='cbs-exchange-course-program-v1',DEFAULT_COURSE_PROGRAM='bsc-dm';
function selectedCourseProgram(){
  try{const v=localStorage.getItem(courseProgramKey);if(v==='all'||state.coursePrograms.some(p=>p.id===v))return v}catch{}
  return DEFAULT_COURSE_PROGRAM;
}
function saveCourseProgram(v){try{localStorage.setItem(courseProgramKey,v)}catch{}}
function courseProgramMeta(id){return state.coursePrograms.find(p=>p.id===id)||null}
function nl2br(v){return esc(v||'').replace(/\n/g,'<br>')}
function placesDeltaFromHistory(u){const p27=requirement(u)?.fall2027Places;return Number.isFinite(p27)&&Number.isFinite(u.latestPlaces)?p27-u.latestPlaces:null}
function historicalAvailability(u){return YEARS.filter(y=>u.history[y]?.status==='available').length}
function gpaPass(r,myGpa){
  if(myGpa==null)return true;
  if(!r||r.matchStatus!=='matched')return false;
  if(Number.isFinite(r.minGpa))return r.minGpa<=myGpa;
  const raw=String(r.minimumGpaRaw||'').trim();
  return !raw||/^(n\/?a|none|no minimum|not required)$/i.test(raw);
}
function gpaReqText(u){const r=requirement(u);return Number.isFinite(r?.minGpa)?r.minGpa.toFixed(1):'—'}
function proofLabel(v){return ({none:'No documentation',documentation:'Documentation required',test:'Language test required',unclear:'Unclear'})[v]||'Unclear'}
function englishCoursesLabel(v){return ({all:'All',many:'Many',several:'Several',limited:'Limited',none:'None',unclear:'Unclear'})[v]||'Unclear'}
function englishOnlyLabel(v){return ({yes:'Yes',no:'No',unclear:'Unclear'})[v]||'Unclear'}
function housingLabel(v){return ({available:'On-campus available',unavailable:'No on-campus housing',unclear:'Unclear'})[v]||'Unclear'}
function academicLabel(v){return ({semester:'Semester',trimester:'Trimester',quarter:'Quarter',term:'Term',unclear:'Unclear'})[v]||'Unclear'}
function fallCalendarCard(r){
  if(!r)return {title:'Not stated',note:'No current MoveON calendar available.'};
  if(r.fallPeriodStatus==='parsed')return {title:r.fallPeriodLabel||'Calendar available',note:[academicLabel(r.academicStructure),r.academicCalendarRaw].filter(Boolean).join(' · ')};
  if(r.fallPeriodStatus==='source_wording_unusual')return {title:r.fallPeriodLabel||'Check MoveON',note:`MoveON states: ${r.academicCalendarRaw||'calendar wording unavailable'}. The wording appears unusual, so verify the dates before planning travel.`};
  if(r.academicCalendarRaw)return {title:academicLabel(r.academicStructure),note:r.academicCalendarRaw};
  return {title:'Not stated',note:`${academicLabel(r.academicStructure)} · No academic calendar note in the current MoveON profile.`};
}
function nonEnglishLabel(r){if(!r)return 'Unclear';if(r.nonEnglishRequirement==='required')return `Required${r.nonEnglishLanguages?`: ${r.nonEnglishLanguages}`:''}`;if(r.nonEnglishRequirement==='conditional')return `Only if using ${r.nonEnglishLanguages||'local-language'} courses`;if(r.nonEnglishRequirement==='not_required')return 'Not required';return 'Unclear'}
function selectedText(id){const el=$('#'+id);return (el?.selectedOptions?.[0]?.dataset.baseLabel||el?.selectedOptions?.[0]?.textContent||'').trim().replace(/\s+\(\d+\)$/,'')}
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
  if($('#detailDialog')?.open&&state.currentDetailId!=null)openDetail(state.currentDetailId,'internal',false);
}
function toggleFavorite(id,source='unknown'){
  id=Number(id);
  const u=state.all.find(x=>x.id===id),adding=!state.favorites.has(id);
  if(adding)state.favorites.add(id);else state.favorites.delete(id);
  saveSelections();
  analyticsCapture(adding?'favorite_added':'favorite_removed',analyticsUniversityProps(u,{source,favorite_count:state.favorites.size}));
  if($('#favoritesOnly')?.checked)applyFilters();else refreshSelectionUI();
}
function toggleCompare(id,source='unknown'){
  id=Number(id);
  const u=state.all.find(x=>x.id===id),adding=!state.compare.has(id);
  if(!adding)state.compare.delete(id);
  else{
    if(state.compare.size>=6){alert('You can compare up to 6 universities at a time. Remove one before adding another.');return}
    state.compare.add(id);
  }
  saveSelections();
  analyticsCapture(adding?'compare_added':'compare_removed',analyticsUniversityProps(u,{source,compare_count:state.compare.size}));
  refreshSelectionUI();
}
function wireSelectionControls(root=document){
  root.querySelectorAll?.('[data-favorite]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(b.dataset.favorite,interactionSource(b))}));
  root.querySelectorAll?.('[data-compare]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleCompare(b.dataset.compare,interactionSource(b))}));
}
function comparisonUrl(){const url=new URL(location.href);url.searchParams.delete('compare');if(state.compare.size)url.searchParams.set('compare',[...state.compare].join(','));url.hash='';return url.toString()}
async function shareComparison(){
  if(state.compare.size<2){const el=$('#compareShareStatus');if(el)el.textContent='Add at least two universities before sharing a comparison.';return}
  const url=comparisonUrl(),status=$('#compareShareStatus');try{await navigator.clipboard.writeText(url);if(status)status.textContent='Comparison link copied.'}catch{if(status)status.innerHTML=`Share this link: <a href="${esc(url)}">${esc(url)}</a>`}
  const chosen=[...state.compare].map(id=>state.all.find(u=>u.id===id)).filter(Boolean);
  analyticsCapture('compare_shared',{compare_count:chosen.length,university_ids:chosen.map(u=>u.id),university_names:chosen.map(u=>u.name)});
}
function activeFilterDescriptors(){
  const out=[];
  const q=$('#search')?.value.trim();
  if(q)out.push({key:'search',label:`Search: “${q}”`});
  if($('#country')?.value)out.push({key:'country',label:`Country: ${selectedText('country')}`});
  if($('#demandLevel')?.value)out.push({key:'demandLevel',label:`2026/27 status: ${selectedText('demandLevel')}`});
  if($('#minPlaces2027')?.value&&$('#minPlaces2027').value!=='0')out.push({key:'minPlaces2027',label:`Fall 2027 places: ${selectedText('minPlaces2027')}`});
  if($('#myGpa')?.value!=='')out.push({key:'myGpa',label:`My GPA: ${selectedText('myGpa')}`});
  if($('#englishOnly')?.checked)out.push({key:'englishOnly',label:'English-only exchange possible'});
  if($('#availabilityMin')?.value&&$('#availabilityMin').value!=='0')out.push({key:'availabilityMin',label:`History: ${selectedText('availabilityMin')}`});
  if($('#placesChange')?.value)out.push({key:'placesChange',label:`2027 capacity: ${selectedText('placesChange')}`});
  if($('#minPlaces')?.value&&$('#minPlaces').value!=='0')out.push({key:'minPlaces',label:`Places 2026/27: ${selectedText('minPlaces')}`});
  if($('#historyWindow')?.value&&$('#historyWindow').value!=='5')out.push({key:'historyWindow',label:`Display history: ${selectedText('historyWindow')}`});
  if($('#arwuMax')?.value&&$('#arwuMax').value!=='0')out.push({key:'arwuMax',label:`ARWU: ${selectedText('arwuMax')}`});
  if($('#languageProof')?.value)out.push({key:'languageProof',label:`Language requirement: ${selectedText('languageProof')}`});
  if($('#englishEvidence')?.value)out.push({key:'englishEvidence',label:`English proof: ${selectedText('englishEvidence')}`});
  if($('#englishEvidence')?.value==='gymnasium'&&$('#gymEnglishLevel')?.value)out.push({key:'gymEnglishLevel',label:`Gymnasium level: ${selectedText('gymEnglishLevel')}`});
  if($('#englishEvidence')?.value==='gymnasium'&&$('#gymEnglishGrade')?.value)out.push({key:'gymEnglishGrade',label:`Gymnasium grade: ${selectedText('gymEnglishGrade')}`});
  if($('#foundedBefore')?.value)out.push({key:'foundedBefore',label:`Founded: ${selectedText('foundedBefore')}`});
  if($('#academicStructure')?.value)out.push({key:'academicStructure',label:`Academic structure: ${selectedText('academicStructure')}`});
  if($('#continent')?.value)out.push({key:'continent',label:`Continent: ${selectedText('continent')}`});
  if($('#minTemp')?.value!=='')out.push({key:'temperature',label:`Temperature · ${selectedText('tempMetric')}: ${selectedText('minTemp')}`});
  if($('#maxCost')?.value!=='')out.push({key:'maxCost',label:`Cost: ${selectedText('maxCost')}`});
  if($('#housingFilter')?.value)out.push({key:'housingFilter',label:`Housing: ${selectedText('housingFilter')}`});
  if($('#favoritesOnly')?.checked)out.push({key:'favoritesOnly',label:'Favorites only'});
  return out;
}
function resetFilter(key){
  if(key==='search')$('#search').value='';
  else if(key==='country')$('#country').value='';
  else if(key==='demandLevel')$('#demandLevel').value='';
  else if(key==='minPlaces2027')$('#minPlaces2027').value='0';
  else if(key==='myGpa')$('#myGpa').value='';
  else if(key==='englishOnly')$('#englishOnly').checked=false;
  else if(key==='availabilityMin')$('#availabilityMin').value='0';
  else if(key==='placesChange')$('#placesChange').value='';
  else if(key==='minPlaces')$('#minPlaces').value='0';
  else if(key==='historyWindow')$('#historyWindow').value='5';
  else if(key==='arwuMax')$('#arwuMax').value='0';
  else if(key==='languageProof')$('#languageProof').value='';
  else if(key==='englishEvidence'){$('#englishEvidence').value='';$('#gymEnglishLevel').value='';$('#gymEnglishGrade').value='';syncLanguageEvidenceControls()}
  else if(key==='gymEnglishLevel')$('#gymEnglishLevel').value='';
  else if(key==='gymEnglishGrade')$('#gymEnglishGrade').value='';
  else if(key==='foundedBefore')$('#foundedBefore').value='';
  else if(key==='academicStructure')$('#academicStructure').value='';
  else if(key==='continent')$('#continent').value='';
  else if(key==='temperature'){ $('#minTemp').value=''; $('#tempMetric').value='AVG'; }
  else if(key==='maxCost')$('#maxCost').value='';
  else if(key==='housingFilter')$('#housingFilter').value='';
  else if(key==='favoritesOnly')$('#favoritesOnly').checked=false;
  applyFilters();
}
function resetAllFilters(){
  $('#search').value='';$('#country').value='';$('#demandLevel').value='';$('#minPlaces2027').value='0';$('#myGpa').value='';$('#englishOnly').checked=false;$('#availabilityMin').value='0';$('#placesChange').value='';$('#minPlaces').value='0';$('#historyWindow').value='5';$('#arwuMax').value='0';$('#languageProof').value='';$('#englishEvidence').value='';$('#gymEnglishLevel').value='';$('#gymEnglishGrade').value='';syncLanguageEvidenceControls();$('#foundedBefore').value='';$('#academicStructure').value='';$('#continent').value='';$('#tempMetric').value='AVG';$('#minTemp').value='';$('#maxCost').value='';$('#housingFilter').value='';$('#favoritesOnly').checked=false;applyFilters();
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
  // Treat CBS's colors as an ORDERED competitiveness scale rather than four
  // unrelated categories: available < filled < competitive < very competitive.
  // Newer years still get more weight (5,4,3,2,1 in a five-year window).
  // The overall category is the recency-weighted median on that scale. This is
  // important because green/yellow/purple all mean that no places remained;
  // they should reinforce each other instead of splitting the vote.
  const allObs=years.map((year,index)=>({
    year,
    status:u.history[year]?.status||'unknown',
    order:STATUS_META[u.history[year]?.status||'unknown']?.order,
    weight:years.length-index
  }));
  const obs=allObs.filter(x=>Number.isFinite(x.order));
  if(!obs.length)return{status:'unknown',order:null,observed:0,selected:years.length,excluded:years.length,override:null,base:'unknown',counts:{},scores:{},weightedMedian:null};

  const counts={},scores={};
  for(const x of obs){
    counts[x.status]=(counts[x.status]||0)+1;
    scores[x.status]=(scores[x.status]||0)+x.weight;
  }

  // Simple (unweighted) median is kept only to indicate when recency changes
  // the classification shown to the user.
  const plainOrders=obs.map(x=>x.order).sort((a,b)=>a-b);
  const plainOrder=plainOrders[Math.floor(plainOrders.length/2)];
  const base=Object.keys(STATUS_META).find(k=>STATUS_META[k].order===plainOrder)||'unknown';

  const weightByOrder=new Map();
  for(const x of obs)weightByOrder.set(x.order,(weightByOrder.get(x.order)||0)+x.weight);
  const totalWeight=[...weightByOrder.values()].reduce((a,b)=>a+b,0);
  let cumulative=0,weightedOrder=0;
  for(const order of [0,1,2,3]){
    cumulative+=weightByOrder.get(order)||0;
    // Upper weighted median: if exactly half the evidence is at/below a level,
    // move to the next level instead of making the result too optimistic.
    if(cumulative>totalWeight/2){weightedOrder=order;break}
  }
  const status=Object.keys(STATUS_META).find(k=>STATUS_META[k].order===weightedOrder)||'unknown';
  const override=status!==base?'recency_weighted':null;

  return{status,order:weightedOrder,observed:obs.length,selected:years.length,excluded:years.length-obs.length,override,base,counts,scores,weightedMedian:weightedOrder};
}
function availabilityInWindow(u){return selectedYears().filter(y=>u.history[y]?.status==='available').length}
function demandChip(status,label=null){const meta=STATUS_META[status]||STATUS_META.unknown;return `<span class="status-chip status-${esc(status)}">${esc(label||meta.short)}</span>`}
function summaryExplanation(s){
  if(s.status==='unknown')return 'No comparable CBS competitiveness observation in the selected period.';
  let text=`Recency-weighted classification: CBS categories are treated as an ordered scale — Places available, All places filled, Competitive, Very competitive. The newest selected year gets ${s.selected} point${s.selected===1?'':'s'}, then ${Math.max(1,s.selected-1)}, down to 1 for the oldest. The weighted median on that scale is used, so different “all places filled” colors reinforce each other instead of splitting the vote.`;
  if(s.override==='recency_weighted')text+=' Recent results changed the classification compared with the unweighted history.';
  if(s.excluded)text+=` ${s.excluded} selected year${s.excluded===1?' was':'s were'} excluded because CBS recorded “No places” or “No data”.`;
  return text;
}
function markerIcon(u){const s=competitionSummary(u),m=STATUS_META[s.status]||STATUS_META.unknown;return L.divIcon({className:'',html:`<div class="uni-marker" style="background:${m.bg};border-color:${m.border}"></div>`,iconSize:[17,17],iconAnchor:[8,8]})}
function popupHtml(u){
  const c=state.climate.get(u.id),s=competitionSummary(u),avg=climateValue(c,'AVG'),ci=costIndex(u);
  return `<div class="popup-name">${esc(u.name)}</div><div class="popup-meta"><span class="country-flag" aria-hidden="true">${countryFlag(u.country)}</span> ${esc(u.country)}${city(u)?` · ${esc(city(u))}`:''} · ${esc(continent(u))} · ${esc(windowLabel())}</div><div class="popup-facts"><div class="popup-demand">${demandChip(s.status)}</div><span>ARWU: <strong>${esc(rankText(u))}</strong></span>${Number.isFinite(avg)?`<span>Sep–Dec average: <strong>${tempText(avg)}</strong></span>`:''}${Number.isFinite(ci)?`<span>Cost: <strong>${esc(costVsDenmarkText(u))}</strong></span>`:''}</div><div class="popup-actions"><button class="popup-btn" data-detail="${u.id}">View details</button>${favoriteButton(u,true)}${compareButton(u,true)}</div>`
}

function sortValue(u,key){
  if(key==='demandScore'){const s=competitionSummary(u);return s.order==null?99:s.order}
  if(key==='availabilityWindow')return availabilityInWindow(u);
  if(key==='costIndex')return costVsDenmark(u);
  if(key==='minGpa')return requirement(u)?.minGpa??null;
  if(key==='languageProof')return requirement(u)?.proofCategory||'';
  if(key==='fall2027Places')return requirement(u)?.fall2027Places??null;
  if(key==='placesDelta')return placesDeltaFromHistory(u);
  if(key.startsWith('temp')){const metric=key.slice(4);return climateValue(state.climate.get(u.id),metric)}
  return u[key];
}
function cmp(a,b,key,dir){let av=sortValue(a,key),bv=sortValue(b,key);const aNull=av==null||Number.isNaN(av),bNull=bv==null||Number.isNaN(bv);if(aNull&&bNull)return 0;if(aNull)return 1;if(bNull)return -1;if(typeof av==='string'||typeof bv==='string')return String(av).localeCompare(String(bv))*dir;return (av-bv)*dir}
function renderTable(){
  const body=$('#tableBody');if(!body)return;const rows=[...state.filtered].sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
  body.innerHTML=rows.map(u=>{const c=state.climate.get(u.id),s=competitionSummary(u),ci=costIndex(u),r=requirement(u),p27=r?.fall2027Places,delta=placesDeltaFromHistory(u);return `<tr>
    <td class="university-cell"><div class="uni-cell-head">${favoriteButton(u,true)}<button class="uni-link" data-detail="${u.id}">${esc(listUniversityTitle(u))}</button></div><span class="muted university-school">${isMultiAgreement(u)?'Separate CBS agreement':esc(u.school||'Regular')}</span><div class="row-compare">${compareButton(u,false)}</div></td>
    <td class="location-cell">${countryLineHtml(u.country)}<span class="city-line">${esc(city(u)||'—')}</span></td>
    <td class="places-cell places-2027-cell"><strong>${Number.isFinite(p27)?p27:'—'}</strong><span class="cell-caption">${Number.isFinite(p27)?'MoveON published':'not published'}</span></td>
    <td class="places-cell"><strong>${u.latestPlaces??'—'}</strong><span class="cell-caption">CBS history</span></td>
    <td class="places-change-cell"><strong class="${Number.isFinite(delta)?(delta>0?'delta-up':delta<0?'delta-down':'delta-same'):''}">${Number.isFinite(delta)?`${delta>0?'+':''}${delta}`:'—'}</strong><span class="cell-caption">${Number.isFinite(delta)?(delta>0?'more':delta<0?'fewer':'same'):'no comparison'}</span></td>
    <td class="availability-cell"><strong>${availabilityInWindow(u)}/${selectedYears().length}</strong><span class="cell-caption">years available</span></td>
    <td class="competition-cell">${demandChip(s.status)}</td>
    <td class="gpa-cell">${Number.isFinite(r?.minGpa)?`<strong>${r.minGpa.toFixed(1)}</strong>`:r?.matchStatus==='matched'?'<span class="muted">Not stated</span>':'—'}</td>
    <td class="language-cell"><span class="muted">${esc(r?.matchStatus==='matched'?proofLabel(r.proofCategory):'No current MoveON match')}</span></td>
    <td class="rank-cell ${u.arwuRank?'ranked':''}">${esc(rankText(u))}</td>
    <td class="temp-cell"><strong>${tempText(climateValue(c,'AVG'))}</strong></td>
    <td class="cost-cell">${Number.isFinite(ci)?`<strong>${esc(costVsDenmarkText(u))}</strong><span>${esc(costLevel(u))}</span>`:'—'}</td>
  </tr>`}).join('');
  body.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail),'list')));wireSelectionControls(body);
}
function renderMarkers(){
  layer.clearLayers();state.markers.clear();for(const u of state.filtered){const c=state.coords.get(u.id);if(!c)continue;const m=L.marker([c.lat,c.lon],{icon:markerIcon(u)}).bindPopup(popupHtml(u));m.on('popupopen',e=>{const root=e.popup.getElement();const btn=root?.querySelector('[data-detail]');if(btn)btn.onclick=()=>openDetail(Number(btn.dataset.detail),'map');if(root)wireSelectionControls(root)});m.addTo(layer);state.markers.set(u.id,m)}
}
function updateLegend(){const el=$('#legendWindow');if(el)el.textContent=`Map colors · ${windowLabel()}`}
function syncLanguageEvidenceControls(){
  const show=$('#englishEvidence')?.value==='gymnasium';
  const levelWrap=$('#gymEnglishLevelWrap'),gradeWrap=$('#gymEnglishGradeWrap');
  if(levelWrap)levelWrap.hidden=!show;
  if(gradeWrap)gradeWrap.hidden=!show;
  if(!show){
    if($('#gymEnglishLevel'))$('#gymEnglishLevel').value='';
    if($('#gymEnglishGrade'))$('#gymEnglishGrade').value='';
  }
}
function gymnasiumProofPass(r,level,grade){
  if(!r)return false;
  const a=r.gymEnglishAMin,b=r.gymEnglishBMin,g=r.gymEnglishGenericMin;
  const candidates=[];
  if(Number.isFinite(g))candidates.push(g);
  if(level==='A'&&Number.isFinite(a))candidates.push(a);
  else if(level==='B'&&Number.isFinite(b))candidates.push(b);
  else if(!level){
    if(Number.isFinite(a))candidates.push(a);
    if(Number.isFinite(b))candidates.push(b);
  }
  if(!candidates.length)return false;
  if(grade==null)return true;
  return candidates.some(req=>grade>=req);
}
function englishEvidencePass(r,evidence,level,grade){
  if(!evidence)return true;
  if(!r)return false;
  // A university requiring no language documentation is always compatible
  // with the student's selected evidence route.
  if(r.proofCategory==='none')return true;
  if(evidence==='cbs_program')return !!r.cbsEnglishProgrammeAccepted;
  if(evidence==='cbs_course_one')return !!r.oneEnglishCourseAccepted;
  if(evidence==='english_60ects')return !!r.english60EctsAccepted;
  if(evidence==='cbs_proficiency')return !!r.cbsEnglishProficiencyLetterAccepted;
  if(evidence==='gymnasium')return gymnasiumProofPass(r,level,grade);
  return true;
}
function readFilterCriteria(){
  return {
    q:$('#search').value.trim().toLowerCase(),country:$('#country').value,demand:$('#demandLevel').value,
    minP27:Number($('#minPlaces2027').value||0),myGpa:$('#myGpa').value===''?null:Number($('#myGpa').value),englishOnly:$('#englishOnly').checked,
    availabilityMin:Number($('#availabilityMin').value||0),placesChange:$('#placesChange').value,minP:Number($('#minPlaces').value||0),
    arwuMax:Number($('#arwuMax').value||0),languageProof:$('#languageProof').value,englishEvidence:$('#englishEvidence').value,gymEnglishLevel:$('#gymEnglishLevel').value,gymEnglishGrade:$('#gymEnglishGrade').value===''?null:Number($('#gymEnglishGrade').value),foundedBefore:$('#foundedBefore').value===''?null:Number($('#foundedBefore').value),
    academicStructure:$('#academicStructure').value,cont:$('#continent').value,tempMetric:$('#tempMetric').value,minTemp:$('#minTemp').value===''?null:Number($('#minTemp').value),
    maxCost:$('#maxCost').value===''?null:Number($('#maxCost').value),housingFilter:$('#housingFilter').value,favoritesOnly:$('#favoritesOnly')?.checked
  };
}
function matchesFilters(u,c){
  const climate=state.climate.get(u.id),tv=climateValue(climate,c.tempMetric),ci=costVsDenmark(u),r=requirement(u),p27=r?.fall2027Places,delta=placesDeltaFromHistory(u);
  const changeOk=!c.placesChange||(c.placesChange==='published'&&Number.isFinite(p27))||(c.placesChange==='unpublished'&&!Number.isFinite(p27))||(c.placesChange==='not_reduced'&&Number.isFinite(delta)&&delta>=0)||(c.placesChange==='increase'&&Number.isFinite(delta)&&delta>0)||(c.placesChange==='same'&&Number.isFinite(delta)&&delta===0)||(c.placesChange==='decrease'&&Number.isFinite(delta)&&delta<0);
  return (!c.q||`${u.name} ${u.school} ${u.country} ${city(u)||''}`.toLowerCase().includes(c.q))&&(!c.country||u.country===c.country)&&(!c.demand||u.latestStatus===c.demand)&&(!c.minP27||(Number.isFinite(p27)&&p27>=c.minP27))&&gpaPass(r,c.myGpa)&&(!c.englishOnly||r?.englishOnlyPossible==='yes')&&(historicalAvailability(u)>=c.availabilityMin)&&changeOk&&((u.latestPlaces??0)>=c.minP)&&(!c.arwuMax||(u.arwuSort&&u.arwuSort<=c.arwuMax))&&(!c.languageProof||r?.proofCategory===c.languageProof)&&englishEvidencePass(r,c.englishEvidence,c.gymEnglishLevel,c.gymEnglishGrade)&&(c.foundedBefore==null||(historyIsVerified(universityHistory(u))&&Number.isFinite(universityHistory(u)?.foundedYear)&&universityHistory(u).foundedYear<c.foundedBefore))&&(!c.academicStructure||r?.academicStructure===c.academicStructure)&&(!c.cont||continent(u)===c.cont)&&(c.minTemp==null||(Number.isFinite(tv)&&tv>=c.minTemp))&&(c.maxCost==null||(Number.isFinite(ci)&&ci<=c.maxCost))&&(!c.housingFilter||r?.onCampusHousing===c.housingFilter)&&(!c.favoritesOnly||state.favorites.has(u.id));
}
const COUNTABLE_SELECTS=['country','demandLevel','minPlaces2027','myGpa','availabilityMin','placesChange','minPlaces','arwuMax','languageProof','englishEvidence','gymEnglishLevel','gymEnglishGrade','foundedBefore','academicStructure','continent','minTemp','maxCost','housingFilter'];
function criteriaForSelectValue(base,id,value){
  const c={...base};
  const numeric=new Set(['minPlaces2027','availabilityMin','minPlaces','arwuMax']);
  const nullableNumeric=new Set(['myGpa','gymEnglishGrade','foundedBefore','minTemp','maxCost']);
  const map={country:'country',demandLevel:'demand',minPlaces2027:'minP27',myGpa:'myGpa',availabilityMin:'availabilityMin',placesChange:'placesChange',minPlaces:'minP',arwuMax:'arwuMax',languageProof:'languageProof',englishEvidence:'englishEvidence',gymEnglishLevel:'gymEnglishLevel',gymEnglishGrade:'gymEnglishGrade',foundedBefore:'foundedBefore',academicStructure:'academicStructure',continent:'cont',minTemp:'minTemp',maxCost:'maxCost',housingFilter:'housingFilter'};
  const prop=map[id];if(!prop)return c;
  c[prop]=numeric.has(id)?Number(value||0):nullableNumeric.has(id)?(value===''?null:Number(value)):value;
  return c;
}
function rememberOptionLabels(){for(const id of COUNTABLE_SELECTS){const el=$('#'+id);if(!el)continue;for(const opt of el.options)if(!opt.dataset.baseLabel)opt.dataset.baseLabel=opt.textContent.trim()}}
function updateFilterOptionCounts(){
  const base=readFilterCriteria();
  for(const id of COUNTABLE_SELECTS){const el=$('#'+id);if(!el)continue;for(const opt of el.options){const c=criteriaForSelectValue(base,id,opt.value),n=state.all.filter(u=>matchesFilters(u,c)).length,label=opt.dataset.baseLabel||opt.textContent.replace(/\s+\(\d+\)$/,'');opt.dataset.baseLabel=label;opt.textContent=`${label} (${n})`;opt.disabled=n===0&&!opt.selected}}
}
const PRESETS={
  available_stable:{demand:'available',placesChange:'not_reduced'},
  available_history:{availabilityMin:3},published:{placesChange:'published'},four_plus:{minP27:4},english:{englishOnly:true}
};
function presetCriteria(name,base=readFilterCriteria()){return {...base,...(PRESETS[name]||{})}}
function presetIsActive(name){const c=readFilterCriteria(),p=PRESETS[name]||{};return Object.entries(p).every(([k,v])=>c[k]===v)}
function writePreset(name,clear=false){
  const p=PRESETS[name]||{};
  if('demand' in p)$('#demandLevel').value=clear?'':p.demand;
  if('placesChange' in p)$('#placesChange').value=clear?'':p.placesChange;
  if('availabilityMin' in p)$('#availabilityMin').value=clear?'0':String(p.availabilityMin);
  if('minP27' in p)$('#minPlaces2027').value=clear?'0':String(p.minP27);
  if('englishOnly' in p)$('#englishOnly').checked=clear?false:p.englishOnly;
}
function applyQuickPreset(name){const clear=presetIsActive(name);writePreset(name,clear);applyFilters();analyticsCapture('filter_preset_used',{preset:name,action:clear?'cleared':'applied',result_count:state.filtered.length})}
function updateQuickFilters(){
  const base=readFilterCriteria();
  document.querySelectorAll('[data-preset]').forEach(b=>{const name=b.dataset.preset,c=presetCriteria(name,base),n=state.all.filter(u=>matchesFilters(u,c)).length;b.classList.toggle('active',presetIsActive(name));const count=b.querySelector('[data-preset-count]');if(count)count.textContent=n});
}
function applyFilters(){
  const criteria=readFilterCriteria();state.filtered=state.all.filter(u=>matchesFilters(u,criteria));
  $('#visibleCount').textContent=state.filtered.length;updateLegend();renderActiveFilters();updateFilterOptionCounts();updateQuickFilters();renderMarkers();renderTable();renderCompare();updateSavedCounts();
}

function renderCompare(){
  const box=$('#compareContent');if(!box)return;const chosen=[...state.compare].map(id=>state.all.find(u=>u.id===id)).filter(Boolean);
  updateSavedCounts();
  if(!chosen.length){box.innerHTML=`<div class="compare-empty"><div class="compare-empty-icon">⇄</div><h3>No universities selected yet</h3><p>Use the <strong>Compare</strong> button next to a university on the map, list or detail view. You can compare up to six.</p></div>`;return}
  if(chosen.length===1){const u=chosen[0];box.innerHTML=`<div class="compare-empty"><div class="compare-one">${favoriteButton(u,true)}<strong>${esc(u.name)}</strong><span>${esc(u.country)}</span></div><h3>Add one more university</h3><p>A comparison becomes most useful with two or more universities.</p><button type="button" class="secondary-button" data-detail="${u.id}">View selected university</button></div>`;box.querySelector('[data-detail]')?.addEventListener('click',()=>openDetail(u.id,'compare'));wireSelectionControls(box);return}
  const cell=u=>({
    demand:demandChip(competitionSummary(u).status),
    places:String(u.latestPlaces??'—'),
    places27:Number.isFinite(requirement(u)?.fall2027Places)?String(requirement(u).fall2027Places):'—',
    delta:Number.isFinite(placesDeltaFromHistory(u))?`${placesDeltaFromHistory(u)>0?'+':''}${placesDeltaFromHistory(u)}`:'—',
    avail:`${availabilityInWindow(u)}/${selectedYears().length}`,
    arwu:esc(rankText(u)),
    avg:tempText(climateValue(state.climate.get(u.id),'AVG')),
    sep:tempText(climateValue(state.climate.get(u.id),'SEP')),
    oct:tempText(climateValue(state.climate.get(u.id),'OCT')),
    nov:tempText(climateValue(state.climate.get(u.id),'NOV')),
    dec:tempText(climateValue(state.climate.get(u.id),'DEC')),
    cost:esc(costVsDenmarkText(u)),
    gpa:Number.isFinite(requirement(u)?.minGpa)?requirement(u).minGpa.toFixed(1):'—',
    proof:esc(proofLabel(requirement(u)?.proofCategory||'unclear')),
    english:esc(englishCoursesLabel(requirement(u)?.englishCoursesCategory||'unclear')),
    otherLang:esc(nonEnglishLabel(requirement(u))),
    academic:esc(academicLabel(requirement(u)?.academicStructure||'unclear')),
    housing:esc(housingLabel(requirement(u)?.onCampusHousing||'unclear')),
    founded:esc(foundingLine(u))
  });
  const rows=[
    ['Location',u=>`${countryLineHtml(u.country)}${city(u)?`<span class="city-line">${esc(city(u))}</span>`:''}<span class="muted location-continent">${esc(continent(u))}</span>`],
    [`Competitiveness · ${windowLabel()}`,u=>cell(u).demand],
    ['CBS places 2026–27',u=>cell(u).places],
    ['Fall 2027 places · MoveON',u=>cell(u).places27],
    ['Change · Fall 2027 vs 2026–27',u=>cell(u).delta],
    [`Years with places available · ${windowLabel()}`,u=>cell(u).avail],
    ['ARWU 2026',u=>cell(u).arwu],
    ['Sep–Dec average',u=>cell(u).avg],
    ['September',u=>cell(u).sep],['October',u=>cell(u).oct],['November',u=>cell(u).nov],['December',u=>cell(u).dec],
    ['Cost vs Denmark',u=>cell(u).cost],
    ['Founded',u=>cell(u).founded],
    ['Minimum CBS GPA',u=>cell(u).gpa],['Language proof',u=>cell(u).proof],['Courses in English',u=>cell(u).english],['Non-English language',u=>cell(u).otherLang],['Academic structure',u=>cell(u).academic],['On-campus housing',u=>cell(u).housing]
  ];
  box.innerHTML=`<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Criteria</th>${chosen.map(u=>`<th><div class="compare-university-head"><div class="compare-head-buttons">${favoriteButton(u,true)}<button type="button" class="remove-compare" data-compare="${u.id}" title="Remove from comparison">×</button></div><button class="compare-name" data-detail="${u.id}">${esc(u.name)}</button><span>${esc(u.school||u.country)}</span></div></th>`).join('')}</tr></thead><tbody>${rows.map(([label,fn])=>`<tr><th>${esc(label)}</th>${chosen.map(u=>`<td>${fn(u)}</td>`).join('')}</tr>`).join('')}<tr><th>Details</th>${chosen.map(u=>`<td><button type="button" class="secondary-button small" data-detail="${u.id}">View details</button></td>`).join('')}</tr></tbody></table></div>`;
  box.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(Number(b.dataset.detail),'compare')));wireSelectionControls(box);
}

function universityHistory(u){return state.universityHistory.get(u.id)||null}
function historyIsVerified(h){return !!h&&h.verificationStatus!=='candidate_unverified'}
function historySourceLabel(h){if(!h)return '';if(h.verificationStatus==='verified_official')return 'Official university source';if(h.verificationStatus==='verified_cbs')return 'CBS MoveON profile';return 'Source verification pending'}
function foundingLine(u){const h=universityHistory(u);if(!h||!Number.isFinite(h.foundedYear))return 'Not yet researched';return `Founded ${h.foundedYear}${Number.isFinite(h.age2026)?` · ${h.age2026} years old`:''}`}
function universityBackgroundInline(u){
  const h=universityHistory(u);if(!h||!Number.isFinite(h.foundedYear))return '';
  const verified=historyIsVerified(h);
  const label=`Established ${h.foundedYear}`;
  const roots=Number.isFinite(h.rootsYear)&&h.rootsYear!==h.foundedYear?`Earlier roots: ${h.rootsYear}`:'';
  const title=[label,historySourceLabel(h),h.historyNote||'',roots].filter(Boolean).join(' — ');
  if(verified&&h.sourceUrl)return `<a class="founding-inline verified" href="${esc(h.sourceUrl)}" target="_blank" rel="noopener" title="${esc(title)}"><span class="founding-separator" aria-hidden="true">·</span><span>${esc(label)}</span></a>`;
  return `<span class="founding-inline provisional" title="${esc(title)}"><span class="founding-separator" aria-hidden="true">·</span><span>${esc(label)}</span></span>`;
}

function climateDetails(u,c){if(!c)return `<p class="muted climate-wait">Climate snapshot unavailable for this location…</p>`;const p=detailClimatePeriod(u,c);if(!p)return `<p class="muted climate-wait">Climate snapshot unavailable for this period…</p>`;const note=p.calendarBased?'MoveON Fall period':'Standard comparison window';return `<div class="climate-summary"><strong>${tempText(p.avg)}</strong><span>${esc(p.label)} average</span></div><details class="month-breakdown"><summary>Monthly breakdown</summary><div class="climate-grid">${p.months.map(k=>`<div class="climate-card"><span>${esc(CLIMATE_MONTH_LABEL[k])}</span><strong>${tempText(c[k])}</strong></div>`).join('')}</div></details><small class="metric-support">${esc(note)}</small>`}
function costDetails(u){const ci=costIndex(u),pct=costVsDenmark(u);if(!Number.isFinite(ci))return `<strong>Cost comparison unavailable</strong><small class="metric-support">No comparable country-level snapshot is available.</small>`;const raw=Math.round(Math.abs(pct));const comparison=raw<3?'About the same as Denmark':pct<0?`${raw}% cheaper than Denmark`:`${raw}% more expensive than Denmark`;return `<strong>${esc(comparison)}</strong><small class="metric-support">${esc(costLevel(u))} · ${esc(u.country)} index ${ci.toFixed(1)} vs Denmark 54.8</small><small>Country-level comparison</small>`}
function detailSectionHead(title,subtitle,infoKey='',infoTitle=''){
  return `<div class="detail-section-head"><div><h3 class="detail-section-title">${esc(title)}${infoKey?infoButton(infoKey,infoTitle||title):''}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div>`;
}
function requirementsHtml(u){
  const r=requirement(u);
  if(!r||r.matchStatus!=='matched')return `<section class="detail-section eligibility-section">${detailSectionHead('Entry requirements','What you need to meet before applying.')}
    <div class="detail-empty-state"><strong>No current MoveON match</strong><span>This university is in the five-year CBS placement workbook but was not found in the current Regular / Undergraduate MoveON list checked on 5 October 2026. Requirements therefore cannot be shown reliably.</span></div></section>`;
  const gpa=Number.isFinite(r.minGpa)?r.minGpa.toFixed(1):'Not stated';
  const tests=[];if(Number.isFinite(r.ielts))tests.push(`IELTS ${r.ielts}`);if(Number.isFinite(r.toefl))tests.push(`TOEFL iBT ${r.toefl}`);if(Number.isFinite(r.cambridge))tests.push(`Cambridge ${r.cambridge}`);
  const langs=nonEnglishLabel(r);const sourceDate=r.sourceCheckedDate||'2026-10-05';
  const spanishRequired=r.nonEnglishRequirement==='required'&&/(^|\b)spanish(\b|$)/i.test(r.nonEnglishLanguages||'');
  const spanishWarning=spanishRequired?'<small class="language-warning-text">Spanish is required for this exchange.</small>':'';
  return `<section class="detail-section eligibility-section">
    <div class="detail-section-head"><div><h3 class="detail-section-title">Entry requirements</h3><p>Check these first to see whether this exchange is realistic for you.</p></div><span class="section-meta source-meta">CBS MoveON · checked ${esc(sourceDate)}${r.detailUrl?` · <a href="${esc(r.detailUrl)}" target="_blank" rel="noopener">Source ↗</a>`:''}</span></div>
    <div class="detail-metrics requirement-metrics">
      <div class="metric-card essential-card"><span>Minimum GPA</span><strong>${esc(gpa)}</strong><small>Danish 7-point scale${r.minimumGpaRaw&&r.minimumGpaRaw!==gpa?` · MoveON: ${esc(r.minimumGpaRaw)}`:''}</small></div>
      <div class="metric-card essential-card ${spanishRequired?'language-warning-card':''}"><span>Language proof</span><strong>${esc(proofLabel(r.proofCategory))}</strong>${tests.length?`<small>${esc(tests.join(' · '))}</small>`:''}${r.cbsLetterAccepted?'<small>CBS proficiency letter accepted</small>':''}${spanishWarning}</div>
      <div class="metric-card essential-card"><span>English-taught courses</span><strong>${esc(englishCoursesLabel(r.englishCoursesCategory))}</strong><small>English-only exchange possible: ${esc(englishOnlyLabel(r.englishOnlyPossible))}</small></div>
      <div class="metric-card essential-card ${spanishRequired?'language-warning-card':''}"><span>Non-English language</span><strong>${esc(langs)}</strong>${r.languageLevels?`<small>${esc(r.languageLevels)}</small>`:''}${spanishWarning}</div>
    </div>
    <div class="practical-section">
      <div class="practical-section-head"><div><h4>Practical exchange details</h4><p>Calendar, housing and exchange-network information.</p></div></div>
      <div class="detail-metrics practical-metrics">
        <div class="metric-card"><span>Fall exchange period</span><strong>${esc(fallCalendarCard(r).title)}</strong><small>${esc(fallCalendarCard(r).note)}</small></div>
        <div class="metric-card"><span>Housing</span><strong>${esc(housingLabel(r.onCampusHousing))}</strong><small>${esc(r.housingRaw||'No housing note')}</small></div>
        <div class="metric-card"><span>Erasmus+ / PIM</span><strong>${esc(r.erasmusPlus==='yes'?'Erasmus+ mentioned':'Erasmus+ not stated')}</strong><small>PIM: ${esc(r.pim==='yes'?'Yes':r.pim==='no'?'No':'Not stated')}</small></div>
      </div>
    </div>
    ${(r.languageRequirementsRaw||r.coursesInEnglishRaw||r.limitationsRaw||r.courseAvailabilityRaw)?`<details class="detail-disclosure source-disclosure">
      <summary><span><strong>Detailed CBS notes</strong><small>Language wording, course access and restrictions</small></span><b aria-hidden="true">⌄</b></summary>
      <div class="detail-note-list">
        ${r.languageRequirementsRaw?`<details class="month-breakdown"><summary>Full language requirements</summary><p>${esc(r.languageRequirementsRaw)}</p></details>`:''}
        ${r.coursesInEnglishRaw?`<details class="month-breakdown"><summary>English-course availability</summary><p>${esc(r.coursesInEnglishRaw)}</p></details>`:''}
        ${r.limitationsRaw?`<details class="month-breakdown"><summary>Limitations / restrictions</summary><p>${esc(r.limitationsRaw)}</p></details>`:''}
        ${r.courseAvailabilityRaw?`<details class="month-breakdown"><summary>Course availability</summary><p>${esc(r.courseAvailabilityRaw)}</p></details>`:''}
      </div>
    </details>`:''}
  </section>`;
}

function courseYearTags(years=[]){
  return years.map(y=>`<span class="course-year ${Number(y)>=2024?'recent':'older'}">${esc(String(y))}</span>`).join('');
}
function approvedCourseRows(items=[]){
  return items.map(x=>`<div class="approved-course-row"><div><strong>${esc(x.title)}</strong>${x.code?`<span class="course-code">${esc(x.code)}</span>`:''}</div><div class="course-years">${courseYearTags(x.years||[])}</div></div>`).join('');
}
function creditEntryHtml(e){
  const eq=[e.equivalent_30_ects,e.measurement].filter(Boolean).join(' ');
  const meta=[e.study_program,e.term,e.weeks?`${e.weeks} weeks`:null].filter(Boolean).join(' · ');
  return `<div class="credit-entry">
    <div class="credit-entry-main"><span>30 ECTS equivalent</span><strong>${esc(eq||'See CBS note')}</strong>${e.course_guidance?`<b>${esc(e.course_guidance)}</b>`:''}</div>
    ${meta?`<div class="credit-entry-meta">${esc(meta)}</div>`:''}
    ${e.comments?`<details class="credit-note"><summary>Workload note</summary><p>${nl2br(e.comments)}</p></details>`:''}
  </div>`;
}
function coursesCreditsHtml(u){
  const approvals=courseApprovalData(u),credit=creditWorkloadData(u),selected=selectedCourseProgram();
  const programs=state.coursePrograms||[],programMeta=courseProgramMeta(selected);
  const selectedItems=selected==='all'?[]:(approvals?.programs?.[selected]||[]);
  const approvalSource=state.courseApprovalSource?.label||'CBS approved-course list';
  const creditSource=state.creditSource?.label||'CBS Credit Database';
  const selector=`<label class="course-program-select"><span>Study programme</span><select id="courseProgramSelect"><option value="all" ${selected==='all'?'selected':''}>All bachelor programmes</option>${programs.map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label>`;
  let approvalsBody='';
  if(selected==='all'){
    const available=programs.map(p=>({p,n:approvals?.programs?.[p.id]?.length||0})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n||a.p.label.localeCompare(b.p.label));
    approvalsBody=available.length?`<div class="program-summary-grid">${available.map(({p,n})=>`<button type="button" class="program-summary" data-course-program-pick="${esc(p.id)}"><strong>${esc(p.label)}</strong><span>${n} previously approved course${n===1?'':'s'}</span></button>`).join('')}</div>`:`<div class="detail-empty-state"><strong>No previous bachelor approvals in this snapshot</strong><span>This does not mean courses at the university cannot be approved.</span></div>`;
  }else if(selectedItems.length){
    const visible=selectedItems.slice(0,12),rest=selectedItems.slice(12);
    approvalsBody=`<div class="course-result-head"><div><strong>${selectedItems.length}</strong> distinct previously approved course${selectedItems.length===1?'':'s'} for <strong>${esc(programMeta?.label||selected)}</strong></div><span>2022–2025</span></div>
      <div class="approved-course-list">${approvedCourseRows(visible)}</div>
      ${rest.length?`<details class="approved-course-more"><summary>Show ${rest.length} more course${rest.length===1?'':'s'}</summary><div class="approved-course-list">${approvedCourseRows(rest)}</div></details>`:''}`;
  }else{
    approvalsBody=`<div class="detail-empty-state"><strong>No previous ${esc(programMeta?.label||'programme')} approvals in this 2022–2025 snapshot</strong><span>A missing course or university only means it has not previously been assessed for this programme in the published list. It is not a rejection or an eligibility rule.</span></div>`;
  }
  const creditEntries=credit?.entries||[];
  const creditBody=creditEntries.length?`<div class="credit-entry-list">${creditEntries.map(creditEntryHtml).join('')}</div>`:`<div class="credit-empty"><strong>No separate undergraduate conversion entry listed</strong><span>The 2026–27 CBS Credit Database does not contain a matched undergraduate conversion row for this university.</span></div>`;
  const dmPolicy=selected==='bsc-dm'?`<div class="program-policy-note"><strong>BSc DM course approval</strong><span>The SEMA Study Board policy says an elective should meet at least 2 of 3 criteria: business relevance, analytical competency development, and programme-specific alignment. Previous approval is useful precedent, not a guarantee.</span></div>`:'';
  return `<section class="detail-section courses-credits-section">
    <div class="detail-section-head"><div><h3 class="detail-section-title">Courses & credits</h3><p>Use earlier CBS approvals as a reference, and check the local workload needed for 30 ECTS.</p></div><span class="section-meta source-meta">CBS course data</span></div>
    <div class="course-credit-grid">
      <div class="course-credit-block credit-block">
        <div class="course-block-head"><div><strong>Credit workload</strong><span>${esc(creditSource)}</span></div></div>
        ${creditBody}
        <p class="course-caveat">The credit database is indicative. Your Study Board makes the final decision on how many credits or courses you need.</p>
      </div>
      <div class="course-credit-block approvals-block">
        <div class="course-block-head"><div><strong>Previously approved electives</strong><span>${esc(approvalSource)}</span></div>${selector}</div>
        ${dmPolicy}
        ${approvalsBody}
        <p class="course-caveat">A course shown here has been approved before, but approval is not guaranteed if the course or programme has changed. A course not shown may simply never have been assessed.</p>
      </div>
    </div>
  </section>`;
}
function wireCourseControls(u){
  const select=$('#courseProgramSelect');
  if(select)select.addEventListener('change',()=>{
    saveCourseProgram(select.value);
    analyticsCapture('course_program_changed',analyticsUniversityProps(u,{study_program:select.value}));
    openDetail(u.id,'internal',false);
  });
  document.querySelectorAll('[data-course-program-pick]').forEach(b=>b.addEventListener('click',()=>{
    saveCourseProgram(b.dataset.courseProgramPick);
    analyticsCapture('course_program_changed',analyticsUniversityProps(u,{study_program:b.dataset.courseProgramPick}));
    openDetail(u.id,'internal',false);
  }));
}

function openDetail(id,source='unknown',trackOpen=true){
  closeInfoPopover();
  const u=state.all.find(x=>x.id===id);if(!u)return;if(trackOpen){analyticsCapture('university_opened',analyticsUniversityProps(u,{source}));startDetailEngagement(u,source)}state.currentDetailId=id;const c=state.climate.get(u.id),s=competitionSummary(u),windowSet=new Set(selectedYears());
  const rankMeta=state.arwuReady?(u.arwuRank?`<strong>${esc(formatRank(u.arwuRank))}</strong><small class="metric-support">${esc(arwuRankNote(u.arwuRank))}</small>${u.arwuMatchedInstitution&&u.arwuMatchedInstitution!==u.name?`<small class="metric-support">ARWU institution: ${esc(u.arwuMatchedInstitution)}</small>`:''}`:u.arwuStatus==='not_top_1000'?`<strong>Not in top 1000</strong><small class="metric-support">Not present in the published ARWU 2026 top 1000.</small>`:`<strong>No verified ARWU match</strong><small class="metric-support">The local match could not be verified.</small>`):'<strong>Rank data loading…</strong>';
  const shift=s.override?'<span class="recent-shift">Recent years weighted more</span>':'';
  const yearsHtml=YEARS.map(y=>{const h=u.history[y],st=h.status||'unknown';return `<div class="year-card status-${esc(st)} ${windowSet.has(y)?'':'outside-window'}"><strong>${y.replace('-','–')}</strong><b>${places(u,y)}</b><span class="year-status">${esc(STATUS_META[st]?.label||h.statusLabel||'Unknown')}</span></div>`}).join('');
  const moveonReq=requirement(u),moveon26=moveonReq?.fall2026Places,moveon27=moveonReq?.fall2027Places,moveonDelta=placesDeltaFromHistory(u);
  const deltaLabel=Number.isFinite(moveonDelta)?`${moveonDelta>0?'+':''}${moveonDelta}`:'—';
  $('#detailContent').innerHTML=`<div class="detail-header"><div><div class="detail-title-row"><h2 class="detail-title">${esc(u.name)}</h2>${universityBackgroundInline(u)}</div><p class="detail-sub"><span>${esc(u.school||'Regular')}</span><span class="meta-sep">·</span><span class="detail-country"><span class="country-flag" aria-hidden="true">${countryFlag(u.country)}</span>${esc(u.country)}</span>${city(u)?`<span class="meta-sep">·</span><span>${esc(city(u))}</span>`:''}<span class="meta-sep">·</span><span>${esc(continent(u))}</span></p></div><div class="detail-actions">${favoriteButton(u,false)}${compareButton(u,false)}</div></div>
    <section class="detail-section overview-section">
      ${detailSectionHead('At a glance','The four headline factors for comparing destinations.')}
      <div class="detail-metrics detail-overview">
        <div class="metric-card">${metricLabel(`Competitiveness · ${windowLabel()}`,'competitiveness')}<div class="demand-summary">${demandChip(s.status)}${shift}</div><small>${s.observed}/${s.selected} selected years comparable</small></div>
        <div class="metric-card">${metricLabel('ARWU 2026','arwu')}${rankMeta}</div>
        <div class="metric-card climate-metric">${metricLabel('Exchange-period temperature','climate')}${climateDetails(u,c)}<small>1991–2020 climate normal</small></div>
        <div class="metric-card">${metricLabel('Cost of living + rent','cost')}${costDetails(u)}</div>
      </div>
    </section>
    <section class="detail-section placement-section">
      <div class="detail-section-head placement-head"><div><h3 class="detail-section-title">CBS placement history ${infoButton('competitiveness','How CBS competitiveness is calculated')}</h3><p>See how many places remained after allocation in each of the last five years.</p></div><span class="section-meta">Highlighted years drive the current map color</span></div>
      <div class="upcoming-capacity"><div><span>Fall 2027 places</span><strong>${Number.isFinite(moveon27)?moveon27:'Not yet published'}</strong><small>CBS MoveON current capacity</small></div><div><span>Change vs 2026/27</span><strong class="${Number.isFinite(moveonDelta)?(moveonDelta>0?'delta-up':moveonDelta<0?'delta-down':'delta-same'):''}">${deltaLabel}</strong><small>${Number.isFinite(u.latestPlaces)?`CBS history 2026/27: ${u.latestPlaces}`:'Needs historical baseline'}</small></div><p>Fall 2027 capacity is separate from the historical competitiveness result and does not affect the map color.</p></div>
      <div class="history">${yearsHtml}</div>
      <div class="history-summary-line"><strong>Overall for ${esc(windowLabel())}: ${esc(STATUS_META[s.status]?.short||'No comparable years')}</strong><span>${s.observed}/${s.selected} comparable years</span></div>
    </section>
    ${requirementsHtml(u)}
    ${coursesCreditsHtml(u)}`;
  wireSelectionControls($('#detailContent'));wireCourseControls(u);
  if(!$('#detailDialog').open)$('#detailDialog').showModal();
  // Climate is intentionally static. If a local row is ever missing, show the
  // unavailable state rather than making a third-party request from the user's browser.
}

function refreshDataStatus(){
  const arwu=state.arwuReady?`ARWU: ${state.arwuRankedCount} ranked · ${state.arwuPendingCount} not in top 1000`:'ARWU: loading local snapshot';
  const climate=`Climate: ${state.climate.size}/${state.all.length} local snapshot`;
  const req=`MoveON: ${[...state.requirements.values()].filter(x=>x.matchStatus==='matched').length}/${state.all.length} current matches`;
  $('#dataStatus').textContent=`${arwu} · ${climate} · ${req}`;
}

function rankLower(rank){if(!rank)return null;const m=String(rank).match(/\d+/);return m?Number(m[0]):null}
async function loadArwu(){
  let rows=[];try{rows=await csvObjects('data/arwu_2026.csv')}catch(e){console.warn('ARWU CSV unavailable',e)}
  const byId=new Map(rows.map(r=>[Number(r.university_id),r]));let ranked=0,unmatched=0;
  for(const u of state.all){const x=byId.get(u.id);const rank=(x?.rank||'').trim();u.arwuRank=rank||null;u.arwuSort=rankLower(rank);u.arwuMatchedInstitution=(x?.matched_institution||'').trim()||null;u.arwuStatus=(x?.status||'').trim()||null;u.arwuPending=false;u.arwuUnmatched=!u.arwuRank;if(u.arwuRank)ranked++;else unmatched++}
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
  try{const rows=await csvObjects('data/climate.csv');for(const r of rows){const id=Number(r.university_id),v={JAN:numCsv(r.jan_c),FEB:numCsv(r.feb_c),MAR:numCsv(r.mar_c),APR:numCsv(r.apr_c),MAY:numCsv(r.may_c),JUN:numCsv(r.jun_c),JUL:numCsv(r.jul_c),AUG:numCsv(r.aug_c),SEP:numCsv(r.sep_c),OCT:numCsv(r.oct_c),NOV:numCsv(r.nov_c),DEC:numCsv(r.dec_c)};if(Number.isFinite(id)&&['SEP','OCT','NOV','DEC'].every(k=>Number.isFinite(v[k])))state.climate.set(id,v)}}catch(e){console.warn('Climate CSV unavailable',e)}
}
async function loadStaticRequirements(){
  try{const rows=await csvObjects('data/partner_requirements.csv');for(const r of rows){const id=Number(r.university_id);if(!Number.isFinite(id))continue;state.requirements.set(id,{matchStatus:r.match_status||'unclear',moveonUniversity:r.moveon_university||'',coreId:r.core_id||'',relationId:r.relation_id||'',detailUrl:r.moveon_detail_url||'',fall2026Places:numCsv(r.fall_2026_places),fall2027Places:numCsv(r.fall_2027_places),placesDelta:numCsv(r.places_change_2027_vs_2026_27_history||r.places_change_2027_vs_2026),numberOfPlacesRaw:r.number_of_places_raw||'',minGpa:numCsv(r.minimum_gpa_danish7),minimumGpaRaw:r.minimum_gpa_raw||'',academicStructure:r.academic_structure||'unclear',academicCalendarRaw:r.academic_calendar_raw||'',fallStartMonth:r.fall_period_start_month||'',fallEndMonth:r.fall_period_end_month||'',fallPeriodLabel:r.fall_period_label||'',fallPeriodStatus:r.fall_period_parse_status||'',workExperience:r.work_experience_required||'unclear',languageInstructionRaw:r.language_of_instruction_raw||'',englishCoursesCategory:r.courses_in_english_category||'unclear',coursesInEnglishRaw:r.courses_in_english_raw||'',proofCategory:r.language_proof_category||'unclear',proofRaw:r.proof_of_language_raw||'',languageRequirementsRaw:r.language_requirements_raw||'',englishOnlyPossible:r.english_only_possible||'unclear',nonEnglishRequirement:r.non_english_requirement||'unclear',nonEnglishLanguages:r.non_english_languages||'',languageLevels:r.language_levels||'',cbsLetterAccepted:boolCsv(r.cbs_letter_accepted),cbsEnglishProgrammeAccepted:boolCsv(r.cbs_english_programme_accepted),cbsEnglishProgrammeAnyWithConditions:boolCsv(r.cbs_english_programme_any_with_conditions),oneEnglishCourseAccepted:boolCsv(r.one_english_taught_cbs_course_accepted),english60EctsAccepted:boolCsv(r.english_60_ects_accepted),cbsEnglishProficiencyLetterAccepted:boolCsv(r.cbs_english_proficiency_letter_accepted),gymEnglishAMin:numCsv(r.danish_gymnasium_english_a_min_grade),gymEnglishBMin:numCsv(r.danish_gymnasium_english_b_min_grade),gymEnglishGenericMin:numCsv(r.danish_gymnasium_english_generic_min_grade),ielts:numCsv(r.ielts_overall_min),toefl:numCsv(r.toefl_ibt_overall_min),cambridge:numCsv(r.cambridge_overall_min),onCampusHousing:r.on_campus_housing||'unclear',housingRaw:r.housing_raw||'',erasmusPlus:r.erasmus_plus||'unclear',pim:r.pim||'unclear',limitationsRaw:r.limitations_raw||'',courseAvailabilityRaw:r.course_availability_raw||'',programInformationRaw:r.program_information_raw||'',additionalInformationRaw:r.additional_information_raw||'',infoAboutUniversityRaw:r.info_about_university_raw||'',visaRaw:r.visa_raw||'',sourceCheckedDate:r.source_checked_date||''})}}catch(e){console.warn('MoveON requirements CSV unavailable',e)}
}
async function loadUniversityHistory(){
  try{const rows=await csvObjects('data/university_history.csv');for(const r of rows){const id=Number(r.university_id);if(!Number.isFinite(id))continue;state.universityHistory.set(id,{foundedYear:numCsv(r.founded_year),age2026:numCsv(r.age_2026),rootsYear:numCsv(r.roots_year),historyNote:r.history_note||'',officialWebsite:r.official_website||'',sourceUrl:r.source_url||'',sourceType:r.source_type||'',verificationStatus:r.verification_status||'candidate_unverified'})}}catch(e){console.warn('University history CSV unavailable',e)}
}

async function loadCourseApprovals(){
  try{
    const r=await fetch('data/course_approvals.json',{cache:'no-store'});if(!r.ok)throw new Error(`course_approvals.json: HTTP ${r.status}`);
    const j=await r.json();state.coursePrograms=j.programs||[];state.courseApprovalSource=j.source||null;
    for(const [id,v] of Object.entries(j.universities||{}))state.courseApprovals.set(Number(id),v);
  }catch(e){console.warn('Course approval data unavailable',e)}
}
async function loadCreditWorkloads(){
  try{
    const r=await fetch('data/credit_workload.json',{cache:'no-store'});if(!r.ok)throw new Error(`credit_workload.json: HTTP ${r.status}`);
    const j=await r.json();state.creditSource=j.source||null;
    for(const [id,v] of Object.entries(j.universities||{}))state.creditWorkloads.set(Number(id),v);
  }catch(e){console.warn('Credit workload data unavailable',e)}
}

async function loadStaticCost(){
  try{const rows=await csvObjects('data/cost_of_living.csv');for(const r of rows){const index=numCsv(r.cost_rent_index),denmark=numCsv(r.denmark_index),pct=numCsv(r.percent_vs_denmark);state.costByCountry.set(r.country,{index,denmark,pct,source:r.source_url||NUMBEO_URL,snapshot:r.snapshot||''})}}catch(e){console.warn('Cost CSV unavailable',e)}
}

async function init(){
  state.all=await loadCoreUniversities();
  state.nameCounts=new Map();for(const u of state.all){const k=universityNameKey(u);state.nameCounts.set(k,(state.nameCounts.get(k)||0)+1)}
  await Promise.all([loadUniversityLocations(),loadStaticClimate(),loadStaticCost(),loadStaticRequirements(),loadUniversityHistory(),loadCourseApprovals(),loadCreditWorkloads()]);
  await loadArwu();state.filtered=[...state.all];loadSavedSelections();
  const validIds=new Set(state.all.map(u=>u.id));state.favorites=new Set([...state.favorites].filter(id=>validIds.has(id)));state.compare=new Set([...state.compare].filter(id=>validIds.has(id)).slice(0,6));saveSelections();
  const countries=[...new Set(state.all.map(u=>u.country))].sort();$('#totalCount').textContent=state.all.length;$('#countryCount').textContent=countries.length;
  const countrySelect=$('#country');countrySelect.innerHTML='<option value="">All countries</option>'+countries.map(c=>`<option value="${esc(c)}">${countryFlag(c)} ${esc(c)}</option>`).join('');
  const continentSelect=$('#continent'),validContinents=new Set(state.all.map(continent));for(const opt of [...continentSelect.options])if(opt.value&&!validContinents.has(opt.value))opt.remove();
  syncLanguageEvidenceControls();
  rememberOptionLabels();
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>applyQuickPreset(b.dataset.preset)));
  const latestSourceDate=[...state.requirements.values()].map(r=>r.sourceCheckedDate).filter(Boolean).sort().at(-1);if(latestSourceDate){const d=new Date(latestSourceDate+'T00:00:00');const label=d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});if($('#moveonUpdated'))$('#moveonUpdated').textContent=label}
  for(const id of ['search','country','demandLevel','minPlaces2027','myGpa','englishOnly','availabilityMin','placesChange','minPlaces','historyWindow','arwuMax','languageProof','englishEvidence','gymEnglishLevel','gymEnglishGrade','foundedBefore','academicStructure','continent','tempMetric','minTemp','maxCost','housingFilter','favoritesOnly']){
    const el=$('#'+id),eventName=id==='search'?'input':'change';
    el.addEventListener(eventName,()=>{
      if(id==='englishEvidence')syncLanguageEvidenceControls();
      applyFilters();
    });
    if(id==='search')el.addEventListener('input',scheduleSearchAnalytics);
    else el.addEventListener('change',()=>trackFilterChanged(el));
  }
  $('#reset').addEventListener('click',resetAllFilters);$('#favoritesQuick').addEventListener('click',()=>{$('#favoritesOnly').checked=true;applyFilters();switchView('list')});$('#shareCompare').addEventListener('click',shareComparison);$('#clearCompare').addEventListener('click',()=>{state.compare.clear();saveSelections();renderCompare();updateSavedCounts()});
  document.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',e=>{
    if(e.target.closest('[data-info]'))return;
    const k=th.dataset.sort;
    if(state.sortKey===k)state.sortDir*=-1;
    else{state.sortKey=k;state.sortDir=(k==='name'||k==='country'||k==='arwuSort'||k==='demandScore'||k==='costIndex'||k==='minGpa'||k==='languageProof')?1:-1}
    renderTable();
    analyticsCapture('sort_changed',{
      sort_key:k,
      sort_name:SORT_ANALYTICS_LABELS[k]||k,
      sort_direction:state.sortDir===1?'ascending':'descending',
      result_count:state.filtered.length
    });
  }));
  $('#mapBtn').addEventListener('click',()=>switchView('map'));$('#listBtn').addEventListener('click',()=>switchView('list'));$('#compareBtn').addEventListener('click',()=>switchView('compare'));
  $('#closeDialog').addEventListener('click',()=>{closeInfoPopover();finishDetailEngagement('close_button');$('#detailDialog').close();state.currentDetailId=null});
  $('#detailDialog').addEventListener('cancel',()=>finishDetailEngagement('escape'));
  $('#detailDialog').addEventListener('close',()=>{finishDetailEngagement('dialog_close');state.currentDetailId=null});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseDetailEngagement();else resumeDetailEngagement()});
  window.addEventListener('pagehide',()=>finishDetailEngagement('page_leave'));
  const filterMenu=$('#filterMenu');
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-info]');if(!b)return;e.preventDefault();e.stopPropagation();openInfoPopover(b,b.dataset.info)});
  document.addEventListener('pointerdown',e=>{
    if(filterMenu?.open&&!filterMenu.contains(e.target))filterMenu.open=false;
    if(activeInfoButton&&!$('#infoPopover')?.contains(e.target)&&!e.target.closest?.('[data-info]'))closeInfoPopover();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(activeInfoButton){closeInfoPopover();e.stopPropagation();return}if(filterMenu?.open){filterMenu.open=false;e.stopPropagation()}}});
  window.addEventListener('resize',()=>{if(activeInfoButton)positionInfoPopover(activeInfoButton)});
  window.addEventListener('scroll',()=>{if(activeInfoButton)positionInfoPopover(activeInfoButton)},true);
  updateSavedCounts();applyFilters();refreshDataStatus();
  analyticsCapture('site_visited',{total_universities:state.all.length,initial_compare_count:state.compare.size,shared_compare_link:new URLSearchParams(location.search).has('compare')});
  const unresolved=state.all.length-state.coords.size;$('#geoStatus').textContent=`· ${state.coords.size} mapped${unresolved?` · ${unresolved} unresolved`:''}`;
  if(unresolved)console.warn(`${unresolved} universities are missing static coordinates in data/university_locations.csv`);
  if(state.climate.size<state.all.length)console.warn(`${state.all.length-state.climate.size} universities are missing static climate rows in data/climate.csv`);
  if(new URLSearchParams(location.search).has('compare')&&state.compare.size)switchView('compare');
}
function switchView(v){
  const isMap=v==='map',isList=v==='list',isCompare=v==='compare';
  $('#mapView').classList.toggle('active',isMap);$('#listView').classList.toggle('active',isList);$('#compareView').classList.toggle('active',isCompare);
  $('#mapBtn').classList.toggle('active',isMap);$('#listBtn').classList.toggle('active',isList);$('#compareBtn').classList.toggle('active',isCompare);
  if(isMap)setTimeout(()=>map.invalidateSize(),50);
  if(isCompare){
    renderCompare();
    const chosen=[...state.compare].map(id=>state.all.find(u=>u.id===id)).filter(Boolean);
    analyticsCapture('compare_viewed',{compare_count:chosen.length,university_ids:chosen.map(u=>u.id),university_names:chosen.map(u=>u.name)});
  }
}
init().catch(e=>{$('#geoStatus').textContent='· could not load dataset';console.error(e)});
