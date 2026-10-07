import json, math, os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error

TZ = timezone(timedelta(hours=7))
ANTAM_API = "https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia"
ANTAM_HISTORY = ANTAM_API + "/history?weight=1&length=365"
BRANKAS_API = "https://logam-mulia-api.iamutaki.workers.dev/api/prices/brankaslm"
BRANKAS_HISTORY = BRANKAS_API + "/history?weight=1&length=365"
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1y&interval=1d"

UA = {"User-Agent": "GoldPredict-ANTAM/1.0 (+https://github.com/akhirobin/goldpredict-antam)"}

def get_json(url):
    r = requests.get(url, headers=UA, timeout=35)
    r.raise_for_status()
    return r.json()

def normalize_antam_rows(payload):
    data = payload.get("data", payload)
    if isinstance(data, dict):
        for key in ("items","rows","results","data"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        return []
    out=[]
    for x in data:
        if not isinstance(x, dict):
            continue
        if str(x.get("material","gold")).lower() != "gold":
            continue
        if x.get("weight") not in (1,1.0,"1","1.0"):
            continue
        mt=str(x.get("materialType",""))
        if mt and mt != "Emas Batangan":
            continue
        p=x.get("sellPrice")
        d=x.get("recordedDate") or x.get("date")
        if p and d:
            out.append({"date":str(d)[:10],"price":float(p)})
    uniq={}
    for x in out:
        uniq[x["date"]]=x
    return sorted(uniq.values(), key=lambda z:z["date"])

def normalize_brankas_rows(payload):
    data = payload.get("data", payload)
    if isinstance(data, dict):
        for key in ("items","rows","results","data"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        return []
    out=[]
    for x in data:
        if not isinstance(x, dict):
            continue
        if str(x.get("material","gold")).lower() != "gold":
            continue
        if x.get("weight") not in (1,1.0,"1","1.0"):
            continue
        mt=str(x.get("materialType",""))
        if mt not in ("Emas Fisik","Emas BRANKAS Korporat"):
            continue
        p=x.get("sellPrice")
        d=x.get("recordedDate") or x.get("date")
        if p and d:
            # prefer Emas Fisik if both exist for the same day
            priority=0 if mt=="Emas Fisik" else 1
            out.append({"date":str(d)[:10],"price":float(p),"priority":priority,"materialType":mt})
    bydate={}
    for x in sorted(out,key=lambda z:(z["date"],z["priority"])):
        bydate.setdefault(x["date"],x)
    return [{"date":v["date"],"price":v["price"]} for v in sorted(bydate.values(),key=lambda z:z["date"])]

def latest_brankas():
    try:
        p=get_json(BRANKAS_API+"?refresh=true")
    except Exception:
        p=get_json(BRANKAS_API)
    data=p.get("data",[])
    rows=[x for x in data if isinstance(x,dict) and x.get("material")=="gold" and float(x.get("weight",0) or 0)==1]
    fisik=next((x for x in rows if x.get("materialType")=="Emas Fisik"),None)
    corp=next((x for x in rows if x.get("materialType")=="Emas BRANKAS Korporat"),None)
    chosen=fisik or corp
    return chosen, fisik, corp

def latest_antam_all():
    # refresh=true asks the public bridge to refresh its cache from Logam Mulia.
    try:
        p=get_json(ANTAM_API+"?refresh=true")
    except Exception:
        p=get_json(ANTAM_API)
    data=p.get("data",[])
    bars=[x for x in data if isinstance(x,dict) and x.get("material")=="gold" and x.get("materialType")=="Emas Batangan"]
    return bars, p

def yahoo_series(symbol):
    p=get_json(YAHOO.format(symbol=requests.utils.quote(symbol, safe="")))
    r=p["chart"]["result"][0]
    ts=r["timestamp"]
    closes=r["indicators"]["quote"][0]["close"]
    rows=[]
    for t,c in zip(ts,closes):
        if c is not None and math.isfinite(c):
            rows.append({"date":datetime.fromtimestamp(t, timezone.utc).date().isoformat(),"close":float(c)})
    return pd.DataFrame(rows).drop_duplicates("date").set_index("date")

def build_features(prices, gold, fx, brankas):
    df=pd.DataFrame(prices).set_index("date").rename(columns={"price":"antam"})
    df=df.join(gold.rename(columns={"close":"gold"}), how="left").join(fx.rename(columns={"close":"fx"}), how="left")
    if brankas is not None and len(brankas):
        df=df.join(brankas.rename(columns={"price":"brankas"}), how="left")
    else:
        df["brankas"]=np.nan
    df[["gold","fx","brankas"]]=df[["gold","fx","brankas"]].ffill().bfill()
    df["brankas_gap"]=df["antam"]-df["brankas"]
    for lag in (1,2,3,5,7):
        df[f"antam_lag_{lag}"]=df["antam"].shift(lag)
        df[f"antam_ret_{lag}"]=df["antam"].pct_change(lag)
        df[f"gold_ret_{lag}"]=df["gold"].pct_change(lag)
        df[f"fx_ret_{lag}"]=df["fx"].pct_change(lag)
        df[f"brankas_ret_{lag}"]=df["brankas"].pct_change(lag)
        df[f"brankas_gap_lag_{lag}"]=df["brankas_gap"].shift(lag)
    for w in (3,5,10,20):
        df[f"ma_{w}"]=df["antam"].rolling(w).mean()
        df[f"vol_{w}"]=df["antam"].pct_change().rolling(w).std()
    df["target"]=df["antam"].shift(-1)
    return df

def forecast(prices, gold, fx, brankas, current_price, brankas_current=None):
    fallback={
        "predicted_antam_1g": round(current_price/1000)*1000,
        "prediction_low": round(current_price*0.99/1000)*1000,
        "prediction_high": round(current_price*1.01/1000)*1000,
        "direction":"SIDEWAYS",
        "confidence_pct":0,
        "backtest_direction_accuracy":None,
        "backtest_mape":None,
        "backtest_mae":None,
        "model":"Fallback / insufficient history",
        "model_note":"Belum cukup histori untuk validasi model."
    }
    if len(prices) < 35:
        return fallback
    df=build_features(prices,gold,fx,brankas)
    feat=[c for c in df.columns if c not in ("antam","gold","fx","brankas","brankas_gap","target")]
    train=df.dropna(subset=feat+["target"]).copy()
    if len(train)<25:
        return fallback
    split=max(int(len(train)*0.8), len(train)-30)
    tr=train.iloc[:split]
    te=train.iloc[split:]
    if len(te)<5:
        return fallback

    models=[
        ExtraTreesRegressor(n_estimators=300,min_samples_leaf=2,random_state=42),
        RandomForestRegressor(n_estimators=300,min_samples_leaf=2,random_state=42),
        GradientBoostingRegressor(n_estimators=180,learning_rate=.035,max_depth=2,loss="huber",random_state=42)
    ]
    test_preds=[]
    next_preds=[]
    latest=df.dropna(subset=feat).iloc[[-1]]
    for m in models:
        m.fit(tr[feat],tr["target"])
        test_preds.append(m.predict(te[feat]))
        m.fit(train[feat],train["target"])
        next_preds.append(float(m.predict(latest[feat])[0]))
    ep=np.mean(np.vstack(test_preds),axis=0)
    actual=te["target"].to_numpy()
    prev=te["antam"].to_numpy()
    dir_acc=float(np.mean(np.sign(ep-prev)==np.sign(actual-prev))*100)
    mae=float(mean_absolute_error(actual,ep))
    mape=float(mean_absolute_percentage_error(actual,ep)*100)
    resid=actual-ep
    sigma=float(np.std(resid)) if len(resid)>2 else mae
    pred=float(np.mean(next_preds))

    # Market adjustment uses the most recent global gold + FX moves, capped to avoid overreaction.
    gold_ret=float(gold["close"].pct_change().iloc[-1]) if len(gold)>1 else 0
    fx_ret=float(fx["close"].pct_change().iloc[-1]) if len(fx)>1 else 0
    brankas_ret=0.0
    if brankas is not None and len(brankas)>1:
        try: brankas_ret=float(brankas["price"].pct_change().iloc[-1])
        except Exception: brankas_ret=0.0
    gap_signal=0.0
    if brankas_current and current_price:
        gap_signal=float(np.clip((current_price-brankas_current)/current_price,-0.08,0.08))
    adj=np.clip(0.40*gold_ret+0.20*fx_ret+0.25*brankas_ret+0.15*gap_signal,-0.015,0.015)
    pred=0.80*pred+0.20*(current_price*(1+adj))
    pred=round(pred/1000)*1000

    delta=(pred-current_price)/current_price
    threshold=max(0.0015, mae/current_price*0.25)
    direction="NAIK" if delta>threshold else "TURUN" if delta<-threshold else "SIDEWAYS"

    # confidence is calibrated from out-of-sample direction accuracy and uncertainty; never fixed.
    confidence=float(np.clip(dir_acc*(1-min(mape/8,0.35)),50,88))
    lo=round(max(0,pred-1.28*max(sigma,mae))/1000)*1000
    hi=round((pred+1.28*max(sigma,mae))/1000)*1000
    return {
        "predicted_antam_1g":int(pred),
        "prediction_low":int(lo),
        "prediction_high":int(hi),
        "direction":direction,
        "confidence_pct":round(confidence,1),
        "backtest_direction_accuracy":round(dir_acc,1),
        "backtest_mape":round(mape,3),
        "backtest_mae":round(mae),
        "model":"Ensemble ExtraTrees + RandomForest + GradientBoosting + BRANKAS feature",
        "model_note":"Prediksi besok dihitung dari histori ANTAM 1g, harga BRANKAS ANTAM, emas dunia, dan USD/IDR. TradingView OANDA:XAUUSD ditampilkan sebagai konfirmasi visual/teknikal. Akurasi adalah hasil holdout terbaru, bukan jaminan."
    }

def main():
    bars, raw=latest_antam_all()
    one=next((x for x in bars if float(x.get("weight",0))==1),None)
    if not one:
        raise RuntimeError("ANTAM 1g tidak ditemukan pada feed Logam Mulia.")
    current=float(one["sellPrice"])
    recorded=one.get("recordedDate")
    try:
        hp=get_json(ANTAM_HISTORY)
        prices=normalize_antam_rows(hp)
    except Exception:
        prices=[]
    if not any(x["date"]==str(recorded)[:10] for x in prices):
        prices.append({"date":str(recorded)[:10],"price":current})
        prices=sorted(prices,key=lambda x:x["date"])

    try: gold=yahoo_series("GC=F")
    except Exception: gold=pd.DataFrame([{"date":prices[-1]["date"],"close":1.0}]).set_index("date")
    try: fx=yahoo_series("IDR=X")
    except Exception: fx=pd.DataFrame([{"date":prices[-1]["date"],"close":1.0}]).set_index("date")
    try:
        bp=get_json(BRANKAS_HISTORY)
        brankas_rows=normalize_brankas_rows(bp)
        brankas=pd.DataFrame(brankas_rows).set_index("date") if brankas_rows else pd.DataFrame(columns=["price"])
    except Exception:
        brankas=pd.DataFrame(columns=["price"])
    try:
        brankas_latest, brankas_fisik, brankas_corp=latest_brankas()
        brankas_current=float(brankas_latest.get("sellPrice")) if brankas_latest else None
    except Exception:
        brankas_latest=brankas_fisik=brankas_corp=None
        brankas_current=None

    pred=forecast(prices,gold,fx,brankas,current,brankas_current)
    now=datetime.now(TZ).isoformat(timespec="seconds")
    products=[{
        "weight":x.get("weight"),"weightUnit":x.get("weightUnit","gr"),
        "sellPrice":x.get("sellPrice"),"recordedDate":x.get("recordedDate"),
        "materialType":x.get("materialType")
    } for x in bars]
    latest={
        "updated_at":now,
        "official_recorded_date":recorded,
        "source_name":"Logam Mulia (via public bridge)",
        "source_url":"https://www.logammulia.com/id/harga-emas-hari-ini",
        "tradingview_symbol":"OANDA:XAUUSD",
        "tradingview_role":"visual_confirmation",
        "antam_sell_1g":int(current),
        "brankas_sell_1g":int(brankas_current) if brankas_current else None,
        "brankas_material_type":brankas_latest.get("materialType") if brankas_latest else None,
        "brankas_recorded_date":brankas_latest.get("recordedDate") if brankas_latest else None,
        "brankas_source_url":"https://brankaslm.com/",
        "products":products,
        **pred
    }
    Path("data").mkdir(exist_ok=True)
    Path("data/latest.json").write_text(json.dumps(latest,ensure_ascii=False,indent=2),encoding="utf-8")

    hist_path=Path("data/history.json")
    try: hist=json.loads(hist_path.read_text(encoding="utf-8")) if hist_path.exists() else []
    except Exception: hist=[]
    rec={
        "updated_at":now,"official_recorded_date":recorded,"antam_sell_1g":int(current),
        "brankas_sell_1g":int(brankas_current) if brankas_current else None,
        "predicted_antam_1g":latest["predicted_antam_1g"],"prediction_low":latest["prediction_low"],
        "prediction_high":latest["prediction_high"],"direction":latest["direction"],
        "confidence_pct":latest["confidence_pct"],"model":latest["model"]
    }
    # one record per official ANTAM date
    hist=[x for x in hist if x.get("official_recorded_date")!=recorded]
    hist.append(rec)
    hist=hist[-730:]
    hist_path.write_text(json.dumps(hist,ensure_ascii=False,indent=2),encoding="utf-8")

if __name__=="__main__":
    main()
