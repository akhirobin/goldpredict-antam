const $=id=>document.getElementById(id);
const fmtIDR=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const fmtUSD=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n||0));
const SESSION_KEY='goldpredict:admin';
const DATA_KEY='goldpredict:history-imported';
const DEMO_USER='admin';
const DEMO_PASS='GoldPredict2026!';

function showAdmin(){
  $('loginView').classList.add('hidden');
  $('adminView').classList.remove('hidden');
  loadHistory();
}
function showLogin(){
  $('adminView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}
$('loginForm').addEventListener('submit',e=>{
  e.preventDefault();
  if($('username').value===DEMO_USER && $('password').value===DEMO_PASS){
    sessionStorage.setItem(SESSION_KEY,'1');
    $('loginError').textContent='';
    showAdmin();
  }else $('loginError').textContent='Username atau password salah.';
});
$('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem(SESSION_KEY);showLogin();});

async function loadHistory(){
  let rows=[];
  try{
    const r=await fetch('data/history.json?ts='+Date.now(),{cache:'no-store'});
    if(r.ok) rows=await r.json();
  }catch(e){}
  try{
    const latest=await fetch('data/latest.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());
    if(latest && !rows.some(x=>x.updated_at===latest.updated_at)) rows.push(latest);
  }catch(e){}
  const imported=JSON.parse(localStorage.getItem(DATA_KEY)||'[]');
  rows=[...rows,...imported];
  rows=dedupe(rows).sort((a,b)=>new Date(a.updated_at)-new Date(b.updated_at));
  window.gpRows=rows;
  render(rows);
}
function dedupe(rows){
  const map=new Map();
  rows.forEach((r,i)=>map.set(r.updated_at||('row-'+i),normalize(r)));
  return [...map.values()];
}
function normalize(r){
  return {
    updated_at:r.updated_at||r.timestamp||r.waktu||new Date().toISOString(),
    xau_usd:+(r.xau_usd||r['XAU/USD']||0),
    usd_idr:+(r.usd_idr||r['USD/IDR']||0),
    antam_sell_1g:+(r.antam_sell_1g||r.antam||r['ANTAM']||0),
    antam_buyback:+(r.antam_buyback||r.buyback||r['Buyback']||0),
    predicted_antam_1g:+(r.predicted_antam_1g||r.prediksi||r['Prediksi']||0),
    direction:r.direction||r.arah||r['Arah']||'-',
    confidence_pct:+(r.confidence_pct||r.confidence||r['Confidence']||0),
    trade_signal:r.trade_signal||r.signal||r['Signal']||'-',
    signal_reason:r.signal_reason||r.alasan||''
  };
}
function render(rows){
  $('totalRecords').textContent=rows.length;
  const last=rows.at(-1);
  $('lastUpdate').textContent=last?new Date(last.updated_at).toLocaleString('id-ID'):'-';
  const conf=rows.filter(r=>r.confidence_pct>0);
  $('avgConfidence').textContent=conf.length?(conf.reduce((s,r)=>s+r.confidence_pct,0)/conf.length).toFixed(1)+'%':'-';
  const verifiable=rows.filter(r=>typeof r.actual_direction==='string');
  $('directionAccuracy').textContent=verifiable.length?((verifiable.filter(r=>r.actual_direction===r.direction).length/verifiable.length)*100).toFixed(1)+'%':'Belum ada data aktual';
  renderTable(rows);
  renderChart(rows);
}
function renderTable(rows){
  $('historyBody').innerHTML=rows.slice().reverse().map(r=>`<tr>
    <td>${new Date(r.updated_at).toLocaleString('id-ID')}</td>
    <td>${fmtUSD(r.xau_usd)}</td>
    <td>Rp ${new Intl.NumberFormat('id-ID').format(r.usd_idr)}</td>
    <td>${fmtIDR(r.antam_sell_1g)}</td>
    <td>${fmtIDR(r.antam_buyback)}</td>
    <td>${fmtIDR(r.predicted_antam_1g)}</td>
    <td>${r.direction}</td>
    <td>${Number(r.confidence_pct||0).toFixed(0)}%</td>
    <td><span class="pill ${String(r.trade_signal||'').toLowerCase()}">${r.trade_signal}</span></td>
  </tr>`).join('');
}
function renderChart(rows){
  const usable=rows.filter(r=>r.antam_sell_1g>0).slice(-80);
  const el=$('chartWrap');
  if(!usable.length){el.innerHTML='<p>Belum ada data histori.</p>';return;}
  const min=Math.min(...usable.map(r=>r.antam_sell_1g));
  const max=Math.max(...usable.map(r=>r.antam_sell_1g));
  const span=Math.max(max-min,1);
  el.innerHTML=usable.map(r=>{
    const h=30+((r.antam_sell_1g-min)/span)*240;
    return `<div class="bar" style="height:${h}px" data-tip="${new Date(r.updated_at).toLocaleString('id-ID')} • ${fmtIDR(r.antam_sell_1g)}"></div>`;
  }).join('');
}
$('searchInput').addEventListener('input',e=>{
  const q=e.target.value.toLowerCase();
  const rows=(window.gpRows||[]).filter(r=>JSON.stringify(r).toLowerCase().includes(q));
  renderTable(rows);
});
$('importBtn').addEventListener('click',()=>$('fileInput').click());
$('fileInput').addEventListener('change',async e=>{
  const file=e.target.files[0]; if(!file) return;
  if(typeof XLSX==='undefined'){alert('Library Excel belum termuat. Pastikan online lalu coba lagi.');return;}
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const raw=XLSX.utils.sheet_to_json(ws,{defval:''});
  const rows=raw.map(normalize);
  localStorage.setItem(DATA_KEY,JSON.stringify(rows));
  alert('Import berhasil: '+rows.length+' baris.');
  loadHistory();
});
$('exportBtn').addEventListener('click',()=>{
  if(typeof XLSX==='undefined'){alert('Library Excel belum termuat. Pastikan online lalu coba lagi.');return;}
  const rows=(window.gpRows||[]).map(r=>({
    Waktu:r.updated_at,'XAU/USD':r.xau_usd,'USD/IDR':r.usd_idr,ANTAM:r.antam_sell_1g,Buyback:r.antam_buyback,
    Prediksi:r.predicted_antam_1g,Arah:r.direction,Confidence:r.confidence_pct,Signal:r.trade_signal,Alasan:r.signal_reason
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'History');
  XLSX.writeFile(wb,'GoldPredict_ANTAM_History.xlsx');
});
if(sessionStorage.getItem(SESSION_KEY)==='1') showAdmin(); else showLogin();