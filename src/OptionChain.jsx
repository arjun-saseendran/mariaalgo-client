import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, Plus, Minus, Zap, AlertTriangle } from "lucide-react";

const LOT_SIZE    = { NIFTY: 65, SENSEX: 20 };
const STRIKE_RANGE = 30;
// Iron Condor server — all option chain and basket execution routes live here
const IC_URL  = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : "https://api.mariaalgo.online";

/* ── Color tokens ──────────────────────────────────────────────────────────── */
const C = {
  bg:        "#07070a",
  bgCard:    "#0d0d11",
  bgHeader:  "#09090e",
  border:    "rgba(255,255,255,0.06)",
  borderFocus:"rgba(99,102,241,0.4)",
  text:      "#e2e8f0",
  textMuted: "#94a3b8",
  textFaint: "#64748b",
  textDead:  "#334155",
  green:     "#34d399",
  greenDim:  "rgba(52,211,153,0.15)",
  red:       "#f87171",
  redDim:    "rgba(248,113,113,0.15)",
  blue:      "#60a5fa",
  blueDim:   "rgba(96,165,250,0.1)",
  blueDark:  "#1d4ed8",
  amber:     "#fbbf24",
  mono:      "'IBM Plex Mono', 'Fira Code', monospace",
  sans:      "'DM Sans', system-ui, sans-serif",
};

/* ── ActionablePriceCell ──────────────────────────────────────────────────── */
const ActionablePriceCell = ({ typeCEPE, strike, price, chp, oi, oiRaw, maxOiRaw, vol, onAddLeg, selectedLegs }) => {
  const isBuy  = selectedLegs.some(l => l.strike === strike && l.optionType === typeCEPE && l.type === "BUY");
  const isSell = selectedLegs.some(l => l.strike === strike && l.optionType === typeCEPE && l.type === "SELL");
  const chpColor  = chp > 0 ? C.green : chp < 0 ? C.red : C.textFaint;
  const hasPrice  = price > 0;
  const oiBarPct  = maxOiRaw > 0 ? Math.min(100, (oiRaw / maxOiRaw) * 100) : 0;
  const oiBarClr  = typeCEPE === "CE" ? "rgba(248,113,113,0.55)" : "rgba(52,211,153,0.55)";

  const btnBase = {
    width: 48, minWidth: 48, flexShrink: 0,
    fontWeight: 900, fontSize: 11, letterSpacing: "0.06em",
    cursor: "pointer", transition: "all 0.12s",
    display: "flex", alignItems: "center", justifyContent: "center", border: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: "100%", minHeight: 52 }}>
      {/* BUY button */}
      <button
        className="btn-action"
        onClick={() => onAddLeg("BUY", strike, typeCEPE, price)}
        style={{
          ...btnBase,
          background: isBuy ? "#1d4ed8" : "rgba(29,78,216,0.08)",
          borderRadius: "8px 0 0 8px",
          color: isBuy ? "#fff" : "#93c5fd",
          boxShadow: isBuy ? "inset 0 0 0 1px #3b82f6" : "inset 0 0 0 1px rgba(59,130,246,0.18)",
        }}
        onMouseEnter={e => { if (!isBuy) { e.currentTarget.style.background = "rgba(29,78,216,0.18)"; e.currentTarget.style.color = "#bfdbfe"; }}}
        onMouseLeave={e => { if (!isBuy) { e.currentTarget.style.background = "rgba(29,78,216,0.08)"; e.currentTarget.style.color = "#93c5fd"; }}}
      >B</button>

      {/* Price data */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "4px 6px",
        background: "rgba(255,255,255,0.018)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(255,255,255,0.04)",
      }}>
        <span className="price-data-text" style={{ fontFamily: C.mono, fontWeight: 700, fontSize: 12.5, letterSpacing: "-0.025em", lineHeight: 1.2, color: hasPrice ? C.text : C.textDead }}>
          {hasPrice ? price.toFixed(2) : "—"}
        </span>
        {chp !== 0 && (
          <span style={{ fontSize: 9, color: chpColor, fontWeight: 700, lineHeight: 1.2, marginTop: 1 }}>
            {chp > 0 ? "+" : ""}{chp?.toFixed(1)}%
          </span>
        )}
        {(oiRaw > 0 || hasPrice) && (
          <span className="hide-mobile" style={{ fontSize: 8, color: C.textFaint, lineHeight: 1.2, marginTop: 1 }}>
            {oi} · {vol}
          </span>
        )}
        {oiBarPct > 0 && (
          <div style={{ width: "80%", height: 2.5, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
            <div style={{ width: oiBarPct + "%", height: "100%", background: oiBarClr, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        )}
      </div>

      {/* SELL button */}
      <button
        className="btn-action"
        onClick={() => onAddLeg("SELL", strike, typeCEPE, price)}
        style={{
          ...btnBase,
          background: isSell ? "#b91c1c" : "rgba(185,28,28,0.08)",
          borderRadius: "0 8px 8px 0",
          color: isSell ? "#fff" : "#fca5a5",
          boxShadow: isSell ? "inset 0 0 0 1px #ef4444" : "inset 0 0 0 1px rgba(239,68,68,0.18)",
        }}
        onMouseEnter={e => { if (!isSell) { e.currentTarget.style.background = "rgba(185,28,28,0.18)"; e.currentTarget.style.color = "#fecaca"; }}}
        onMouseLeave={e => { if (!isSell) { e.currentTarget.style.background = "rgba(185,28,28,0.08)"; e.currentTarget.style.color = "#fca5a5"; }}}
      >S</button>
    </div>
  );
};

/* ── Main ─────────────────────────────────────────────────────────────────── */
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
  const [marketClosed, setMarketClosed] = useState(false);
  const [fetchError,   setFetchError]   = useState(null);
  const [dataSource,   setDataSource]   = useState(null);
  const atmRowRef = useRef(null);

  const lotSize  = LOT_SIZE[symbol] || 65;
  const totalQty = lots * lotSize;

  const fetchChain = async () => {
    try {
      const res = await fetch(`${IC_URL}/api/options/chain?symbol=${symbol}&strikes=${STRIKE_RANGE}`);
      if (!res.ok) { const e = await res.json().catch(() => ({})); setFetchError(e.error || `Server error ${res.status}`); return; }
      const data = await res.json();
      if (data.error) { setFetchError(data.error); return; }
      if (data.chain) {
        setChainData(data.chain);
        setSpotPrice(data.spotPrice);
        setAtmStrike(data.atmStrike);
        setExpiry(data.expiry || "");
        setMarketClosed(!!data.marketClosed);
        setDataSource(data.dataSource || null);
        setFetchError(null);
        setLastUpdated(new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }));
      }
    } catch (err) {
      setFetchError("Failed to reach server");
    } finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); setChainData([]); setLots(1); fetchChain(); const itv = setInterval(fetchChain, marketClosed ? 60000 : 5000); return () => clearInterval(itv); }, [symbol, marketClosed]);
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
      const sells = selectedLegs.filter(l => l.type === "SELL");
      const buys  = selectedLegs.filter(l => l.type === "BUY");

      // Check if selection matches a standard iron condor (2 sells + 2 buys)
      const isCondorShape = sells.length === 2 && buys.length === 2;

      if (!isCondorShape) {
        alert(
          "⚠️ Manual basket execution requires exactly 2 SELL legs + 2 BUY legs (iron condor shape).\n\n" +
          "Use the standard Enter button on the dashboard for automatic strike selection."
        );
        return;
      }

      const res = await fetch(`${IC_URL}/api/trades/enter`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: symbol, quantity: totalQty, mode: "SEMI_AUTO" }),
      });
      if (res.ok) {
        alert("✅ Iron Condor entry triggered! Check dashboard for confirmation.");
        setSelectedLegs([]);
      } else {
        const err = await res.json().catch(() => ({}));
        alert("❌ Entry Failed: " + (err.error || res.status));
      }
    } catch (err) { alert("❌ " + err.message); }
    finally { setIsExecuting(false); }
  };

  const totalPremium = selectedLegs.reduce((s, l) => l.type === "SELL" ? s + l.price : s - l.price, 0);
  const totalPnL     = totalPremium * totalQty;

  return (
    <div style={{ height: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: C.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900&family=IBM+Plex+Mono:wght@400;700&display=swap');
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        
        /* ── Responsive Utilities ── */
        @media (max-width: 600px) {
          .header-container { flex-wrap: wrap !important; padding: 8px !important; gap: 8px !important; }
          .header-left, .header-right { flex: 1 1 auto; justify-content: space-between; }
          .header-center { width: 100% !important; order: -1; margin-bottom: 4px; }
          .header-center > div { display: flex; flex-direction: column; gap: 4px; }
          .lot-bar-container { flex-wrap: wrap !important; gap: 8px !important; }
          .table-header { grid-template-columns: 1fr 48px 1fr !important; }
          .strike-col { width: 48px !important; font-size: 10px !important; }
          .btn-action { width: 26px !important; min-width: 26px !important; font-size: 10px !important; }
          .price-data-text { font-size: 10px !important; }
          .hide-mobile { display: none !important; }
          .basket-summary { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .basket-summary-inner { width: 100% !important; justify-content: space-between !important; }
          .leg-chip { font-size: 9px !important; padding: 3px 6px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="header-container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, padding: "10px 16px", flexShrink: 0, background: C.bgHeader }}>

        <div className="header-left">
          <button onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: C.textMuted, padding: "7px 14px", borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.12s", fontFamily: C.sans }}
            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
            <ArrowLeft size={11} /> Back
          </button>
        </div>

        {/* Spot price center */}
        <div className="header-center" style={{ textAlign: "center" }}>
          {spotPrice ? (
            <div>
              <div style={{ fontFamily: C.mono, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span className="hide-mobile" style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>{symbol}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: marketClosed ? C.amber : C.green, letterSpacing: "-0.03em" }}>
                  ₹{spotPrice?.toLocaleString("en-IN")}
                </span>
                {marketClosed && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#b45309", background: "rgba(180,83,9,0.1)", border: "1px solid rgba(180,83,9,0.22)", borderRadius: 5, padding: "2px 7px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Last Session
                  </span>
                )}
                {!marketClosed && dataSource === "KITE_LIVE" && (
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#059669", background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 5, padding: "2px 7px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    ● Kite Live
                  </span>
                )}
              </div>
              {expiry && <div style={{ fontSize: 9, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>Expiry {expiry}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.textFaint }}>—</div>
          )}
        </div>

        {/* Symbol + refresh */}
        <div className="header-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
            {["NIFTY", "SENSEX"].map(s => (
              <button key={s} onClick={() => setSymbol(s)}
                style={{ padding: "5px 16px", borderRadius: 7, fontSize: 11, fontWeight: 800, background: symbol === s ? C.blueDark : "transparent", color: symbol === s ? "#fff" : C.textFaint, border: "none", cursor: "pointer", transition: "all 0.15s", fontFamily: C.sans }}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={fetchChain}
            style={{ color: C.textFaint, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, cursor: "pointer", padding: "7px", display: "flex", borderRadius: 8, transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = C.textFaint; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── Lot selector bar ── */}
      <div className="lot-bar-container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, background: C.bgHeader, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Lot Size <strong style={{ color: C.textMuted, fontFamily: C.mono }}>{lotSize}</strong>
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 9, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.1em" }}>Lots</span>
          <div style={{ display: "flex", alignItems: "center", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "3px 6px", border: `1px solid ${C.border}` }}>
            <button onClick={() => setLots(l => Math.max(1, l - 1))}
              style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: C.textMuted, cursor: "pointer", borderRadius: 5, transition: "all 0.1s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = C.text; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.textMuted; }}>
              <Minus size={11} />
            </button>
            <span style={{ fontFamily: C.mono, fontWeight: 700, color: C.text, fontSize: 14, minWidth: 26, textAlign: "center" }}>{lots}</span>
            <button onClick={() => setLots(l => Math.min(50, l + 1))}
              style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: C.textMuted, cursor: "pointer", borderRadius: 5, transition: "all 0.1s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = C.text; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.textMuted; }}>
              <Plus size={11} />
            </button>
          </div>
          <span style={{ fontSize: 12, color: C.green, fontWeight: 800, fontFamily: C.mono }}>{totalQty}</span>
          <span style={{ fontSize: 9, color: C.textFaint }}>qty</span>
        </div>

        <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {lastUpdated && <span style={{ fontSize: 9, color: C.textFaint, fontFamily: C.mono }}>{lastUpdated}</span>}
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className="table-header" style={{ display: "grid", gridTemplateColumns: "1fr 72px 1fr", padding: "5px 3px", background: C.bgHeader, borderBottom: `1px solid rgba(255,255,255,0.03)`, flexShrink: 0 }}>
        {[["CALL · OI · Vol", "CE"], ["PUT · OI · Vol", "PE"]].map(([label, side], idx) => (
          <div key={side} style={{ display: "flex", alignItems: "center" }}>
            {idx === 1 && <span className="btn-action" style={{ width: 48, textAlign: "center", fontSize: 8, fontWeight: 900, color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.1em" }}>BUY</span>}
            <span style={{ flex: 1, textAlign: "center", fontSize: 8, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
            {idx === 0 && <span className="btn-action" style={{ width: 48, textAlign: "center", fontSize: 8, fontWeight: 900, color: "#fca5a5", textTransform: "uppercase", letterSpacing: "0.1em" }}>SELL</span>}
            {idx === 0 && <span className="btn-action" style={{ width: 48, textAlign: "center", fontSize: 8, fontWeight: 900, color: "#93c5fd", textTransform: "uppercase", letterSpacing: "0.1em" }}>BUY</span>}
            {idx === 1 && <span className="btn-action" style={{ width: 48, textAlign: "center", fontSize: 8, fontWeight: 900, color: "#fca5a5", textTransform: "uppercase", letterSpacing: "0.1em" }}>SELL</span>}
          </div>
        ))}
        <div className="strike-col" style={{ textAlign: "center", fontSize: 8, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", alignSelf: "center" }}>STRIKE</div>
      </div>

      {/* ── Chain table ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.textMuted, gap: 10, fontSize: 13 }}>
            <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />
            Loading chain…
          </div>
        ) : fetchError ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
            <AlertTriangle size={18} color="#f87171" />
            <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700 }}>{fetchError}</div>
            <button onClick={fetchChain}
              style={{ fontSize: 11, color: C.textMuted, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontWeight: 700, fontFamily: C.sans }}>
              Retry
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {(() => {
                const maxOiRaw = Math.max(1, ...chainData.map(r => Math.max(r.ce.oiRaw || 0, r.pe.oiRaw || 0)));
                return chainData.map((row, i) => {
                  const isATM     = row.strike === atmStrike;
                  const isITMCall = spotPrice && row.strike < spotPrice;
                  const isITMPut  = spotPrice && row.strike > spotPrice;
                  return (
                    <tr key={i} ref={isATM ? atmRowRef : null} style={{
                      borderBottom: isATM
                        ? "1px solid rgba(96,165,250,0.35)"
                        : "1px solid rgba(255,255,255,0.03)",
                      background: isATM ? "rgba(30,58,138,0.15)" : "transparent",
                    }}>
                      {/* CE side */}
                      <td style={{ width: "43%", padding: "2px 3px 2px 2px", background: isITMCall ? "rgba(120,20,20,0.07)" : "transparent" }}>
                        <ActionablePriceCell
                          typeCEPE="CE" strike={row.strike} price={row.ce.ltp} chp={row.ce.chp}
                          oi={row.ce.oi} oiRaw={row.ce.oiRaw || 0} maxOiRaw={maxOiRaw} vol={row.ce.vol}
                          onAddLeg={addLeg} selectedLegs={selectedLegs} />
                      </td>
                      {/* Strike */}
                      <td className="strike-col" style={{ width: 72, textAlign: "center", padding: "4px 2px" }}>
                        <div style={{ fontFamily: C.mono, fontSize: isATM ? 13 : 11, fontWeight: isATM ? 900 : 500, color: isATM ? C.blue : C.textFaint, letterSpacing: isATM ? "-0.02em" : 0 }}>
                          {row.strike}
                        </div>
                        {isATM && <div style={{ fontSize: 7.5, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 1 }}>ATM</div>}
                      </td>
                      {/* PE side */}
                      <td style={{ width: "43%", padding: "2px 2px 2px 3px", background: isITMPut ? "rgba(5,60,40,0.08)" : "transparent" }}>
                        <ActionablePriceCell
                          typeCEPE="PE" strike={row.strike} price={row.pe.ltp} chp={row.pe.chp}
                          oi={row.pe.oi} oiRaw={row.pe.oiRaw || 0} maxOiRaw={maxOiRaw} vol={row.pe.vol}
                          onAddLeg={addLeg} selectedLegs={selectedLegs} />
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Basket ── */}
      {selectedLegs.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: "1px solid rgba(96,165,250,0.15)", background: C.bgHeader, padding: "10px 14px 14px", animation: "fadeIn 0.2s ease" }}>
          {/* Leg chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {selectedLegs.map((leg, i) => (
              <div className="leg-chip" key={i} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 8px 4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 700, fontFamily: C.mono,
                background: leg.type === "BUY" ? "rgba(29,78,216,0.1)" : "rgba(185,28,28,0.1)",
                border: `1px solid ${leg.type === "BUY" ? "rgba(59,130,246,0.25)" : "rgba(239,68,68,0.25)"}`,
                color: leg.type === "BUY" ? "#93c5fd" : "#fca5a5",
              }}>
                <span style={{ fontSize: 8.5, fontWeight: 900 }}>{leg.type}</span>
                <span style={{ color: C.textMuted }}>{leg.strike}{leg.optionType}</span>
                <span style={{ color: C.textFaint }}>@{leg.price?.toFixed(2)}</span>
                <span style={{ color: C.textFaint, fontSize: 8.5 }}>×{leg.qty}</span>
                <button onClick={() => setSelectedLegs(selectedLegs.filter((_, j) => j !== i))}
                  style={{ marginLeft: 3, background: "none", border: "none", color: C.textDead, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0, fontFamily: C.sans }}
                  onMouseEnter={e => e.currentTarget.style.color = C.red}
                  onMouseLeave={e => e.currentTarget.style.color = C.textDead}>×</button>
              </div>
            ))}
          </div>

          {/* Summary row */}
          <div className="basket-summary" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div className="basket-summary-inner" style={{ display: "flex", gap: 24 }}>
              <div>
                <span style={{ fontSize: 8.5, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.09em" }}>Net Premium </span>
                <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: totalPremium >= 0 ? C.green : C.red }}>
                  {totalPremium >= 0 ? "+" : ""}₹{totalPremium.toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 8.5, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.09em" }}>Max P&L </span>
                <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: totalPnL >= 0 ? C.green : C.red }}>
                  {totalPnL >= 0 ? "+" : ""}₹{totalPnL.toFixed(0)}
                </span>
              </div>
            </div>
            <button onClick={() => setSelectedLegs([])}
              style={{ fontSize: 8.5, color: C.textFaint, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.09em", fontFamily: C.sans, transition: "color 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.color = C.red}
              onMouseLeave={e => e.currentTarget.style.color = C.textFaint}>
              Clear All
            </button>
          </div>

          {/* Execute button */}
          <button onClick={handleExecute} disabled={isExecuting}
            style={{
              width: "100%",
              background: isExecuting ? "#1e3a5f" : "linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%)",
              border: "none", borderRadius: 12, color: "#fff",
              padding: "14px 0", fontWeight: 900, fontSize: 11.5,
              letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: isExecuting ? "not-allowed" : "pointer",
              opacity: isExecuting ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: isExecuting ? "none" : "0 0 28px rgba(37,99,235,0.4)",
              transition: "all 0.15s", fontFamily: C.sans,
            }}
            onMouseEnter={e => { if (!isExecuting) e.currentTarget.style.boxShadow = "0 0 40px rgba(59,130,246,0.55)"; }}
            onMouseLeave={e => { if (!isExecuting) e.currentTarget.style.boxShadow = "0 0 28px rgba(37,99,235,0.4)"; }}>
            <Zap size={13} />
            {isExecuting ? "Executing…" : `Execute ${selectedLegs.length} Leg${selectedLegs.length > 1 ? "s" : ""} · ${lots} Lot${lots > 1 ? "s" : ""} · ${totalQty} Qty`}
          </button>
        </div>
      )}
    </div>
  );
};

export default OptionChain;