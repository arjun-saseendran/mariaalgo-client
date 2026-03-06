import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, Plus, Minus, Zap } from "lucide-react";

const LOT_SIZE    = { NIFTY: 65, SENSEX: 20 };
const STRIKE_RANGE = 30;

// ─── Color tokens (all verified visible on #070709 background) ───────────────
const C = {
  text:      "#e5e7eb",   // primary
  textMuted: "#9ca3af",   // secondary labels
  textFaint: "#6b7280",   // tertiary / meta info  ← was #374151 (invisible)
  textDead:  "#4b5563",   // truly disabled
  green:     "#34d399",
  red:       "#f87171",
  blue:      "#60a5fa",
  blueDark:  "#2563eb",
  mono:      "'JetBrains Mono', monospace",
};

// ─── ActionablePriceCell ──────────────────────────────────────────────────────
const ActionablePriceCell = ({ typeCEPE, strike, price, chp, oi, oiRaw, maxOiRaw, vol, onAddLeg, selectedLegs }) => {
  const isBuySelected  = selectedLegs.some(l => l.strike === strike && l.optionType === typeCEPE && l.type === "BUY");
  const isSellSelected = selectedLegs.some(l => l.strike === strike && l.optionType === typeCEPE && l.type === "SELL");
  const chpColor = chp > 0 ? C.green : chp < 0 ? C.red : C.textFaint;
  const hasPrice = price > 0;
  const oiBarPct   = maxOiRaw > 0 ? Math.min(100, (oiRaw / maxOiRaw) * 100) : 0;
  const oiBarColor = typeCEPE === "CE" ? "rgba(248,113,113,0.5)" : "rgba(52,211,153,0.5)";

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: "100%", minHeight: 48 }}>

      {/* BUY — full height, 52px wide, flush to LTP */}
      <button
        onClick={() => onAddLeg("BUY", strike, typeCEPE, price)}
        style={{
          width: 52, minWidth: 52, flexShrink: 0,
          background: isBuySelected ? "#1d4ed8" : "rgba(37,99,235,0.10)",
          border: isBuySelected ? "1px solid #3b82f6" : "1px solid rgba(59,130,246,0.22)",
          borderRight: "none", borderRadius: "7px 0 0 7px",
          color: isBuySelected ? "#fff" : "#93c5fd",
          fontWeight: 900, fontSize: 12, letterSpacing: "0.05em",
          cursor: "pointer", transition: "background 0.1s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={e => { if (!isBuySelected) { e.currentTarget.style.background = "rgba(37,99,235,0.22)"; e.currentTarget.style.color = "#bfdbfe"; }}}
        onMouseLeave={e => { if (!isBuySelected) { e.currentTarget.style.background = "rgba(37,99,235,0.10)"; e.currentTarget.style.color = "#93c5fd"; }}}
      >B</button>

      {/* Price info */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "3px 5px",
        background: "rgba(255,255,255,0.025)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 12.5, letterSpacing: "-0.02em", lineHeight: 1.2,
          color: hasPrice ? C.text : C.textFaint }}>  {/* ← was #374151 for "—" */}
          {hasPrice ? price.toFixed(2) : "—"}
        </span>
        {chp !== 0 && (
          <span style={{ fontSize: 9.5, color: chpColor, fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>
            {chp > 0 ? "+" : ""}{chp?.toFixed(1)}%
          </span>
        )}
        <span style={{ fontSize: 8.5, color: C.textMuted, lineHeight: 1.2, marginTop: 1 }}>  {/* ← was #374151 */}
          {oi} · {vol}
        </span>
        {oiBarPct > 0 && (
          <div style={{ width: "80%", height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
            <div style={{ width: oiBarPct + "%", height: "100%", background: oiBarColor, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        )}
      </div>

      {/* SELL — full height, 52px wide, flush to LTP */}
      <button
        onClick={() => onAddLeg("SELL", strike, typeCEPE, price)}
        style={{
          width: 52, minWidth: 52, flexShrink: 0,
          background: isSellSelected ? "#b91c1c" : "rgba(239,68,68,0.10)",
          border: isSellSelected ? "1px solid #ef4444" : "1px solid rgba(239,68,68,0.22)",
          borderLeft: "none", borderRadius: "0 7px 7px 0",
          color: isSellSelected ? "#fff" : "#fca5a5",
          fontWeight: 900, fontSize: 12, letterSpacing: "0.05em",
          cursor: "pointer", transition: "background 0.1s",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        onMouseEnter={e => { if (!isSellSelected) { e.currentTarget.style.background = "rgba(239,68,68,0.22)"; e.currentTarget.style.color = "#fecaca"; }}}
        onMouseLeave={e => { if (!isSellSelected) { e.currentTarget.style.background = "rgba(239,68,68,0.10)"; e.currentTarget.style.color = "#fca5a5"; }}}
      >S</button>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const OptionChain = ({ onClose }) => {
  const [symbol,       setSymbol]       = useState("NIFTY");
  const [lots,         setLots]         = useState(1);
  const [chainData,    setChainData]    = useState([]);
  const [spotPrice,    setSpotPrice]    = useState(null);
  const [atmStrike,    setAtmStrike]    = useState(null);
  const [expiry,       setExpiry]       = useState("");
  const [selectedLegs, setSelectedLegs] = useState([]);
  const [isExecuting,  setIsExecuting]  = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const atmRowRef = useRef(null);

  const lotSize  = LOT_SIZE[symbol] || 65;
  const totalQty = lots * lotSize;

  const fetchChain = async () => {
    try {
      const res  = await fetch(`https://api.mariaalgo.online/api/options/chain?symbol=${symbol}&strikes=${STRIKE_RANGE}`);
      const data = await res.json();
      if (data.chain) {
        setChainData(data.chain);
        setSpotPrice(data.spotPrice);
        setAtmStrike(data.atmStrike);
        setExpiry(data.expiry || "");
        setLastUpdated(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }));
      }
    } catch (err) { console.error("Option chain fetch failed:", err); }
    finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); setChainData([]); setLots(1); fetchChain(); const itv = setInterval(fetchChain, 5000); return () => clearInterval(itv); }, [symbol]);
  useEffect(() => { if (atmRowRef.current) setTimeout(() => atmRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150); }, [atmStrike]);
  useEffect(() => { if (selectedLegs.length > 0) setSelectedLegs(prev => prev.map(l => ({ ...l, lots, qty: lots * lotSize }))); }, [lots]);

  const addLeg = (type, strike, optionType, price) => {
    const idx = selectedLegs.findIndex(l => l.strike === strike && l.optionType === optionType && l.type === type);
    if (idx >= 0) setSelectedLegs(selectedLegs.filter((_, i) => i !== idx));
    else setSelectedLegs([...selectedLegs, { type, strike, optionType, price, lots, qty: totalQty }]);
  };

  const handleExecute = async () => {
    if (!window.confirm(`Execute ${selectedLegs.length} legs × ${lots} lot${lots > 1 ? "s" : ""} = ${totalQty} qty?`)) return;
    setIsExecuting(true);
    try {
      const res = await fetch("https://api.mariaalgo.online/api/trades/execute-basket", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, lots, legs: selectedLegs }),
      });
      if (res.ok) { alert("✅ Execution Success!"); setSelectedLegs([]); } else alert("❌ Execution Failed");
    } catch (err) { alert("❌ Execution Failed: " + err.message); }
    finally { setIsExecuting(false); }
  };

  const totalPremium = selectedLegs.reduce((s, l) => l.type === "SELL" ? s + l.price : s - l.price, 0);
  const totalPnL     = totalPremium * totalQty;

  return (
    <div style={{ height: "100vh", background: "#070709", color: C.text, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#374151;border-radius:4px}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #111827", padding:"10px 16px", flexShrink:0, background:"#08080a" }}>
        <button onClick={onClose}
          style={{ display:"flex", alignItems:"center", gap:6, background:"#111827", border:"1px solid #1f2937", color:C.textMuted, padding:"6px 12px", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textMuted}>
          <ArrowLeft size={11}/> Back
        </button>

        <div style={{ textAlign:"center" }}>
          {spotPrice && (
            <div style={{ fontFamily:C.mono, fontWeight:700, fontSize:17, letterSpacing:"-0.02em" }}>
              <span style={{ color:C.textMuted, marginRight:6 }}>{symbol}</span>
              <span style={{ color:C.green }}>₹{spotPrice?.toLocaleString("en-IN")}</span>
            </div>
          )}
          {expiry && <div style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:2 }}>Expiry {expiry}</div>}
          {/* ↑ fixed: was #374151 */}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ display:"flex", background:"#111827", borderRadius:8, padding:2, border:"1px solid #1f2937" }}>
            {["NIFTY","SENSEX"].map(s=>(
              <button key={s} onClick={()=>setSymbol(s)} style={{ padding:"5px 14px", borderRadius:6, fontSize:11, fontWeight:800, background:symbol===s?C.blueDark:"transparent", color:symbol===s?"#fff":C.textFaint, border:"none", cursor:"pointer" }}>{s}</button>
            ))}
          </div>
          <button onClick={fetchChain} style={{ color:C.textFaint, background:"none", border:"none", cursor:"pointer", padding:4, display:"flex" }}
            onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textFaint}>
            <RefreshCw size={13}/>
          </button>
        </div>
      </div>

      {/* Lot selector */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px", borderBottom:"1px solid #0d1117", background:"#08080b", flexShrink:0 }}>
        <span style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em" }}>
          Lot Size <strong style={{ color:C.textMuted }}>{lotSize}</strong>
        </span>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em" }}>Lots</span>
          <div style={{ display:"flex", alignItems:"center", gap:2, background:"#111827", borderRadius:8, padding:"3px 6px", border:"1px solid #1f2937" }}>
            <button onClick={()=>setLots(l=>Math.max(1,l-1))} style={{ width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:C.textMuted, cursor:"pointer", borderRadius:4 }}
              onMouseEnter={e=>{e.currentTarget.style.background="#1f2937";e.currentTarget.style.color=C.text}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=C.textMuted}}>
              <Minus size={11}/>
            </button>
            <span style={{ fontFamily:C.mono, fontWeight:700, color:C.text, fontSize:13, minWidth:22, textAlign:"center" }}>{lots}</span>
            <button onClick={()=>setLots(l=>Math.min(50,l+1))} style={{ width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", background:"none", border:"none", color:C.textMuted, cursor:"pointer", borderRadius:4 }}
              onMouseEnter={e=>{e.currentTarget.style.background="#1f2937";e.currentTarget.style.color=C.text}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=C.textMuted}}>
              <Plus size={11}/>
            </button>
          </div>
          <span style={{ fontSize:11, color:C.green, fontWeight:800, fontFamily:C.mono }}>{totalQty} qty</span>
        </div>
        {/* ↓ fixed: was #1f2937 (completely invisible) */}
        {lastUpdated && <span style={{ fontSize:9, color:C.textFaint, fontFamily:C.mono }}>{lastUpdated}</span>}
      </div>

      {/* Column headers */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 76px 1fr", padding:"5px 4px", background:"#08080b", borderBottom:"1px solid #0d1117", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <span style={{ width:52, textAlign:"center", fontSize:9, fontWeight:900, color:"#93c5fd", textTransform:"uppercase", letterSpacing:"0.08em" }}>BUY</span>
          <span style={{ flex:1, textAlign:"center", fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.07em" }}>CALL · chg · OI</span>
          {/* ↑ fixed: was #374151 */}
          <span style={{ width:52, textAlign:"center", fontSize:9, fontWeight:900, color:"#fca5a5", textTransform:"uppercase", letterSpacing:"0.08em" }}>SELL</span>
        </div>
        <div style={{ textAlign:"center", fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.08em", alignSelf:"center" }}>STRIKE</div>
        <div style={{ display:"flex", alignItems:"center" }}>
          <span style={{ width:52, textAlign:"center", fontSize:9, fontWeight:900, color:"#93c5fd", textTransform:"uppercase", letterSpacing:"0.08em" }}>BUY</span>
          <span style={{ flex:1, textAlign:"center", fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.07em" }}>PUT · chg · OI</span>
          <span style={{ width:52, textAlign:"center", fontSize:9, fontWeight:900, color:"#fca5a5", textTransform:"uppercase", letterSpacing:"0.08em" }}>SELL</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {loading ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.textMuted, gap:8, fontSize:13 }}>
            <RefreshCw size={16} style={{ animation:"spin 1s linear infinite" }}/> Loading...
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <tbody>
              {(() => {
                const maxOiRaw = Math.max(1, ...chainData.map(r => Math.max(r.ce.oiRaw || 0, r.pe.oiRaw || 0)));
                return chainData.map((row, i) => {
                const isATM     = row.strike === atmStrike;
                const isITMCall = spotPrice && row.strike < spotPrice;
                const isITMPut  = spotPrice && row.strike > spotPrice;
                return (
                  <tr key={i} ref={isATM ? atmRowRef : null} style={{
                    borderBottom: isATM ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.035)",
                    background: isATM ? "rgba(30,58,138,0.2)" : "transparent",
                  }}>
                    <td style={{ width:"42%", padding:"2px 6px 2px 3px", background:isITMCall?"rgba(127,29,29,0.08)":"transparent" }}>
                      <ActionablePriceCell typeCEPE="CE" strike={row.strike} price={row.ce.ltp} chp={row.ce.chp} oi={row.ce.oi} oiRaw={row.ce.oiRaw || 0} maxOiRaw={maxOiRaw} vol={row.ce.vol} onAddLeg={addLeg} selectedLegs={selectedLegs}/>
                    </td>
                    <td style={{ width:76, textAlign:"center", padding:"4px 0" }}>
                      <div style={{ fontFamily:C.mono, fontSize:isATM?13:11.5, fontWeight:isATM?900:600, color:isATM?"#60a5fa":C.textMuted }}>
                        {row.strike}
                      </div>
                      {isATM && <div style={{ fontSize:8, color:"#3b82f6", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:1 }}>ATM</div>}
                    </td>
                    <td style={{ width:"42%", padding:"2px 3px 2px 6px", background:isITMPut?"rgba(6,78,59,0.09)":"transparent" }}>
                      <ActionablePriceCell typeCEPE="PE" strike={row.strike} price={row.pe.ltp} chp={row.pe.chp} oi={row.pe.oi} oiRaw={row.pe.oiRaw || 0} maxOiRaw={maxOiRaw} vol={row.pe.vol} onAddLeg={addLeg} selectedLegs={selectedLegs}/>
                    </td>
                  </tr>
                );
              });})()}
            </tbody>
          </table>
        )}
      </div>

      {/* Basket */}
      {selectedLegs.length > 0 && (
        <div style={{ flexShrink:0, borderTop:"1px solid rgba(59,130,246,0.2)", background:"#08080b", padding:"10px 14px 12px" }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
            {selectedLegs.map((leg, i) => (
              <div key={i} style={{
                display:"flex", alignItems:"center", gap:5,
                padding:"3px 8px 3px 10px", borderRadius:6, fontSize:10, fontWeight:700,
                background:leg.type==="BUY"?"rgba(37,99,235,0.12)":"rgba(220,38,38,0.12)",
                border:`1px solid ${leg.type==="BUY"?"rgba(59,130,246,0.3)":"rgba(239,68,68,0.3)"}`,
                color:leg.type==="BUY"?"#93c5fd":"#fca5a5", fontFamily:C.mono,
              }}>
                <span style={{ fontSize:9, fontWeight:900 }}>{leg.type}</span>
                <span style={{ color:C.textMuted }}>{leg.strike}{leg.optionType}</span>
                <span style={{ color:C.textFaint }}>@{leg.price?.toFixed(2)}</span>
                <span style={{ color:C.textFaint, fontSize:9 }}>×{leg.qty}</span> {/* ← fixed */}
                <button onClick={()=>setSelectedLegs(selectedLegs.filter((_,j)=>j!==i))}
                  style={{ marginLeft:2, background:"none", border:"none", color:C.textDead, cursor:"pointer", fontSize:14, lineHeight:1, padding:0 }}
                  onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.textDead}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ display:"flex", gap:20 }}>
              <div>
                <span style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.08em" }}>Net Premium </span>
                <span style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:totalPremium>=0?C.green:C.red }}>
                  {totalPremium>=0?"+":""}₹{totalPremium.toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.08em" }}>Max P&L </span>
                <span style={{ fontFamily:C.mono, fontSize:12, fontWeight:700, color:totalPnL>=0?C.green:C.red }}>
                  {totalPnL>=0?"+":""}₹{totalPnL.toFixed(0)}
                </span>
              </div>
            </div>
            {/* ↓ fixed: was #374151 */}
            <button onClick={()=>setSelectedLegs([])}
              style={{ fontSize:9, color:C.textFaint, background:"none", border:"none", cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em" }}
              onMouseEnter={e=>e.currentTarget.style.color=C.red} onMouseLeave={e=>e.currentTarget.style.color=C.textFaint}>
              Clear All
            </button>
          </div>

          <button onClick={handleExecute} disabled={isExecuting} style={{
            width:"100%", background:isExecuting?"#1e3a5f":"linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)",
            border:"none", borderRadius:10, color:"#fff", padding:"13px 0",
            fontWeight:900, fontSize:12, letterSpacing:"0.12em", textTransform:"uppercase",
            cursor:isExecuting?"not-allowed":"pointer", opacity:isExecuting?0.6:1,
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow:isExecuting?"none":"0 0 22px rgba(37,99,235,0.35)", transition:"all 0.15s",
          }}
            onMouseEnter={e=>{if(!isExecuting)e.currentTarget.style.boxShadow="0 0 32px rgba(37,99,235,0.55)"}}
            onMouseLeave={e=>{if(!isExecuting)e.currentTarget.style.boxShadow="0 0 22px rgba(37,99,235,0.35)"}}>
            <Zap size={13}/>
            {isExecuting ? "Executing..." : `Execute ${selectedLegs.length} Leg${selectedLegs.length>1?"s":""} · ${lots} Lot${lots>1?"s":""} · ${totalQty} Qty`}
          </button>
        </div>
      )}
    </div>
  );
};

export default OptionChain;