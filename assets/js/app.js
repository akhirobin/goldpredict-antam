const fmtIDR=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const $=id=>document.getElementById(id);
const LOCAL='data/latest.json';
const LIVE='https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia';

function daysOld(dateStr){
  if(!dateStr)return 999;
  const d=new Date(dateStr+'T00:00:00+07:00');
  return Math.floor((Date.now()-d.getTime())/86400000);
}
function setText(id,v){const el=$(id);if(el)el.textContent=v;}
function productRows(products){
  return products.slice().sort((a,b)=>Number(a.weight)-Number(b.weight)).map(p=>{
    const w=Number(p.weight), price=Number(p.sellPrice||0);
    return '<tr><td><strong>'+w+' '+(p.weightUnit||'gr')+'</strong></td><td>'+fmtIDR(price)+'</td><td>'+fmtIDR(price/w)+'</td><td>'+(p.recordedDate||'-')+'</td></tr>';
  }).join('');
}
function render(d){
  const current=Number(d.antam_sell_1g||0), pred=Number(d.predicted_antam_1g||0);
  const delta=current?((pred-current)/current*100):0;
  setText('antam',fmtIDR(current));
  setText('antamMini',fmtIDR(current));
  setText('officialDate',d.official_recorded_date?'Tanggal resmi '+d.official_recorded_date:'Tanggal resmi belum tersedia');
  setText('antamDateMini',d.official_recorded_date||'-');
  setText('predicted',fmtIDR(pred));
  setText('predMini',fmtIDR(pred));
  setText('range','Range: '+fmtIDR(d.prediction_low)+' – '+fmtIDR(d.prediction_high));
  setText('direction',d.direction||'-');
  setText('dirMini',d.direction||'-');
  setText('confidence','Confidence: '+Number(d.confidence_pct||0).toFixed(1)+'%');
  setText('confMini','Confidence '+Number(d.confidence_pct||0).toFixed(1)+'%');
  setText('predChange',(delta>=0?'+':'')+delta.toFixed(2)+'% dari hari ini');
  setText('backtestAcc',d.backtest_direction_accuracy==null?'Belum cukup data':Number(d.backtest_direction_accuracy).toFixed(1)+'%');
  setText('mape',d.backtest_mape==null?'Belum cukup data':Number(d.backtest_mape).toFixed(3)+'%');
  setText('modelName',d.model||'-');
  setText('brankasMini',d.brankas_sell_1g?fmtIDR(d.brankas_sell_1g):'Belum tersedia');
  setText('brankasDateMini',d.brankas_recorded_date?('Update '+d.brankas_recorded_date):'Sumber BRANKAS belum sinkron');
  setText('modelStatus',d.confidence_pct>0?'TERVALIDASI':'MENUNGGU DATA');
  setText('modelNote',d.model_note||'');
  setText('lastUpdate',d.updated_at?new Date(d.updated_at).toLocaleString('id-ID'):'-');
  setText('updated',d.updated_at?new Date(d.updated_at).toLocaleString('id-ID'):'-');
  setText('mode',navigator.onLine?'ONLINE':'OFFLINE CACHE');
  const dir=$('direction'); if(dir)dir.className=String(d.direction||'').toLowerCase()==='naik'?'up':String(d.direction||'').toLowerCase()==='turun'?'down':'sideways';
  const age=daysOld(d.official_recorded_date);
  const f=$('freshness');
  if(f){
    f.textContent=age<=1?'Data resmi terbaru tersedia':('Data resmi feed berumur '+age+' hari — cek sumber');
    f.className='freshness '+(age<=1?'fresh':'stale');
  }
  if(Array.isArray(d.products)&&d.products.length) $('productBody').innerHTML=productRows(d.products);
  localStorage.setItem('goldpredict:last',JSON.stringify(d));
}

async function loadLocal(){
  const r=await fetch(LOCAL+'?ts='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('local unavailable');
  return r.json();
}
async function loadLiveAntam(base){
  try{
    const r=await fetch(LIVE+'?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('live unavailable');
    const j=await r.json();
    const products=(j.data||[]).filter(x=>x.material==='gold'&&x.materialType==='Emas Batangan');
    const one=products.find(x=>Number(x.weight)===1);
    if(one){
      base.products=products;
      base.antam_sell_1g=one.sellPrice;
      base.official_recorded_date=one.recordedDate;
    }
  }catch(e){}
  return base;
}
async function loadData(){
  setText('status','SINKRONISASI...');
  try{
    let d=await loadLocal();
    if(navigator.onLine)d=await loadLiveAntam(d);
    render(d);
    $('status').textContent=navigator.onLine?'ONLINE / AUTO':'OFFLINE';
    $('status').className='badge '+(navigator.onLine?'live':'offline');
  }catch(e){
    const c=localStorage.getItem('goldpredict:last');
    if(c)render(JSON.parse(c));
    $('status').textContent='OFFLINE';
    $('status').className='badge offline';
  }
}
$('refreshBtn').addEventListener('click',loadData);
loadData();
setInterval(loadData,300000);
window.addEventListener('online',loadData);
window.addEventListener('offline',loadData);
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');