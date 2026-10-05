const fmtIDR = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
const fmtUSD = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const $ = id => document.getElementById(id);

async function loadData(){
  try{
    const r=await fetch('data/latest.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('data unavailable');
    const d=await r.json();
    $('xau').textContent=fmtUSD(d.xau_usd);
    $('xauChange').textContent=(d.xau_change_pct>=0?'▲ ':'▼ ')+Math.abs(d.xau_change_pct).toFixed(2)+'%';
    $('fx').textContent='Rp '+new Intl.NumberFormat('id-ID').format(d.usd_idr);
    $('fxChange').textContent=(d.usd_idr_change_pct>=0?'▲ ':'▼ ')+Math.abs(d.usd_idr_change_pct).toFixed(2)+'%';
    $('antam').textContent=fmtIDR(d.antam_sell_1g);
    $('buyback').textContent=fmtIDR(d.antam_buyback);
    $('spread').textContent='Spread '+fmtIDR(d.antam_sell_1g-d.antam_buyback);
    $('predicted').textContent=fmtIDR(d.predicted_antam_1g);
    $('range').textContent='Range: '+fmtIDR(d.prediction_low)+' – '+fmtIDR(d.prediction_high);
    $('direction').textContent=d.direction;
    $('confidence').textContent='Confidence: '+d.confidence_pct.toFixed(0)+'%';
    $('tradeSignal').textContent=d.trade_signal;
    $('tradeSignal').className='signal-pill '+d.trade_signal.toLowerCase();
    $('signalReason').textContent=d.signal_reason;
    $('updated').textContent=new Date(d.updated_at).toLocaleString('id-ID');
    $('mode').textContent=navigator.onLine?'ONLINE':'OFFLINE CACHE';
    $('status').textContent=navigator.onLine?'LIVE / ONLINE':'OFFLINE';
    $('status').className='badge '+(navigator.onLine?'live':'offline');
    localStorage.setItem('goldpredict:last',JSON.stringify(d));
  }catch(e){
    const cached=localStorage.getItem('goldpredict:last');
    if(cached){
      const d=JSON.parse(cached);
      $('xau').textContent=fmtUSD(d.xau_usd);
      $('fx').textContent='Rp '+new Intl.NumberFormat('id-ID').format(d.usd_idr);
      $('antam').textContent=fmtIDR(d.antam_sell_1g);
      $('buyback').textContent=fmtIDR(d.antam_buyback);
      $('predicted').textContent=fmtIDR(d.predicted_antam_1g);
      $('range').textContent='Range: '+fmtIDR(d.prediction_low)+' – '+fmtIDR(d.prediction_high);
      $('direction').textContent=d.direction;
      $('confidence').textContent='Confidence: '+d.confidence_pct.toFixed(0)+'%';
      $('tradeSignal').textContent=d.trade_signal;
      $('signalReason').textContent='Mode offline: '+d.signal_reason;
      $('updated').textContent=new Date(d.updated_at).toLocaleString('id-ID');
    }
    $('mode').textContent='OFFLINE CACHE';
    $('status').textContent='OFFLINE';
    $('status').className='badge offline';
  }
}
loadData();
setInterval(loadData,60000);
window.addEventListener('online',loadData);
window.addEventListener('offline',loadData);
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');