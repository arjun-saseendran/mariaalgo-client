import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw, Plus, Minus, ChevronUp, ChevronDown } from "lucide-react";

const LOT_SIZE = { NIFTY: 65, SENSEX: 20 };
const STRIKE_RANGE = 20; // 20 strikes each side = 41 total rows

const ActionablePriceCell = ({ typeCEPE, strike, price, chp, oi, vol, onAddLeg, selectedLegs }) => {
  const isBuySelected  = selectedLegs.some(l => l.strike === strike && l.optionType === typeCEPE && l.type === "BUY");
  const isSellSelected = selectedLegs.some(l => l.strike === strike && l.optionType === typeCEPE && l.type === "SELL");
  const chpColor = chp > 0 ? "text-emerald-400" : chp < 0 ? "text-red-400" : "text-gray-600";
  const isOTMCall = typeCEPE === "CE" && chp < 0;
  const isOTMPut  = typeCEPE === "PE" && chp > 0;

  return (
    <div className="flex items-center gap-1 justify-between px-2 py-1">
      <button
        onClick={() => onAddLeg("BUY", strike, typeCEPE, price)}
        className={`px-2 py-0.5 text-[9px] font-black rounded transition-all shrink-0 ${isBuySelected ? "bg-blue-600 text-white" : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/30"}`}
      >B</button>

      <div className="flex-1 text-center">
        <div className={`font-mono font-bold text-xs ${price === 0 ? "text-gray-700" : "text-gray-100"}`}>
          {price > 0 ? price.toFixed(2) : "—"}
        </div>
        <div className={`text-[9px] ${chpColor}`}>
          {chp !== 0 ? `${chp > 0 ? "+" : ""}${chp?.toFixed(1)}%` : ""}
        </div>
        <div className="text-[8px] text-gray-700">{oi} · {vol}</div>
      </div>

      <button
        onClick={() => onAddLeg("SELL", strike, typeCEPE, price)}
        className={`px-2 py-0.5 text-[9px] font-black rounded transition-all shrink-0 ${isSellSelected ? "bg-red-600 text-white" : "bg-red-500/10 text-red-500 hover:bg-red-500/30"}`}
      >S</button>
    </div>
  );
};

const OptionChain = ({ onClose }) => {
  const [symbol, setSymbol]         = useState("NIFTY");
  const [lots, setLots]             = useState(1);
  const [chainData, setChainData]   = useState([]);
  const [spotPrice, setSpotPrice]   = useState(null);
  const [atmStrike, setAtmStrike]   = useState(null);
  const [expiry, setExpiry]         = useState("");
  const [selectedLegs, setSelectedLegs] = useState([]);
  const [isExecuting, setIsExecuting]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated]   = useState(null);
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
    } catch (err) {
      console.error("Option chain fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setChainData([]);
    setLots(1);
    fetchChain();
    const itv = setInterval(fetchChain, 5000);
    return () => clearInterval(itv);
  }, [symbol]);

  useEffect(() => {
    if (atmRowRef.current) {
      setTimeout(() => atmRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  }, [atmStrike]);

  useEffect(() => {
    if (selectedLegs.length > 0) {
      setSelectedLegs(prev => prev.map(l => ({ ...l, lots, qty: lots * lotSize })));
    }
  }, [lots]);

  const addLeg = (type, strike, optionType, price) => {
    const exists = selectedLegs.findIndex(
      l => l.strike === strike && l.optionType === optionType && l.type === type
    );
    if (exists >= 0) {
      setSelectedLegs(selectedLegs.filter((_, i) => i !== exists));
    } else {
      setSelectedLegs([...selectedLegs, { type, strike, optionType, price, lots, qty: totalQty }]);
    }
  };

  const handleExecute = async () => {
    if (!window.confirm(`Execute ${selectedLegs.length} legs × ${lots} lot${lots > 1 ? "s" : ""} = ${totalQty} qty?`)) return;
    setIsExecuting(true);
    try {
      const res = await fetch("https://api.mariaalgo.online/api/trades/execute-basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, lots, legs: selectedLegs }),
      });
      if (res.ok) { alert("✅ Execution Success!"); setSelectedLegs([]); }
      else alert("❌ Execution Failed");
    } catch (err) {
      alert("❌ Execution Failed: " + err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const totalPremium = selectedLegs.reduce((sum, l) => l.type === "SELL" ? sum + l.price : sum - l.price, 0);
  const totalPnL     = totalPremium * totalQty;

  return (
    <div className="h-screen bg-[#080808] text-gray-100 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-[11px] font-bold transition-all">
          <ArrowLeft size={12} /> Back
        </button>

        <div className="text-center leading-tight">
          {spotPrice && (
            <div className="text-base font-black font-mono">
              {symbol} <span className="text-emerald-400">&#8377;{spotPrice?.toLocaleString("en-IN")}</span>
            </div>
          )}
          {expiry && <div className="text-[9px] text-gray-500 uppercase tracking-widest">Expiry: {expiry}</div>}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-gray-900 p-0.5 rounded">
            {["NIFTY", "SENSEX"].map(s => (
              <button key={s} onClick={() => setSymbol(s)}
                className={`px-3 py-1 rounded text-[11px] font-bold transition-all ${symbol === s ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
              >{s}</button>
            ))}
          </div>
          <button onClick={fetchChain} className="text-gray-600 hover:text-white transition-all p-1">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── Lot Selector ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0c0c0e] border-b border-gray-800/60 shrink-0">
        <div className="text-[9px] text-gray-600">
          LOT SIZE <span className="text-gray-400 font-bold">{lotSize}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-500 uppercase tracking-widest">Lots</span>
          <div className="flex items-center gap-1 bg-gray-900 rounded px-1.5 py-0.5">
            <button onClick={() => setLots(l => Math.max(1, l - 1))}
              className="text-gray-500 hover:text-white w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 transition-all">
              <Minus size={10} />
            </button>
            <span className="font-black text-white w-5 text-center text-xs">{lots}</span>
            <button onClick={() => setLots(l => Math.min(50, l + 1))}
              className="text-gray-500 hover:text-white w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700 transition-all">
              <Plus size={10} />
            </button>
          </div>
          <span className="text-[9px] text-emerald-500 font-bold">{totalQty} qty</span>
        </div>
        {lastUpdated && <div className="text-[9px] text-gray-700">{lastUpdated}</div>}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-[#0c0c0e] border-b border-gray-800">
              <tr>
                <th className="py-2 px-2 text-[9px] uppercase text-gray-600 text-center w-[42%]">
                  CALL <span className="text-gray-700 normal-case">· chg · OI · Vol</span>
                </th>
                <th className="py-2 text-[9px] uppercase text-gray-600 text-center w-[16%]">Strike</th>
                <th className="py-2 px-2 text-[9px] uppercase text-gray-600 text-center w-[42%]">
                  PUT <span className="text-gray-700 normal-case">· chg · OI · Vol</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {chainData.map((row, i) => {
                const isATM  = row.strike === atmStrike;
                const isITMCall = spotPrice && row.strike < spotPrice;
                const isITMPut  = spotPrice && row.strike > spotPrice;

                return (
                  <tr
                    key={i}
                    ref={isATM ? atmRowRef : null}
                    className={`border-b transition-colors ${
                      isATM
                        ? "border-blue-500/40 bg-blue-950/30"
                        : "border-gray-800/30 hover:bg-gray-900/20"
                    }`}
                  >
                    {/* CALL */}
                    <td className={`${isITMCall ? "bg-red-950/10" : ""}`}>
                      <ActionablePriceCell
                        typeCEPE="CE" strike={row.strike}
                        price={row.ce.ltp} chp={row.ce.chp}
                        oi={row.ce.oi} vol={row.ce.vol}
                        onAddLeg={addLeg} selectedLegs={selectedLegs}
                      />
                    </td>

                    {/* STRIKE */}
                    <td className={`text-center py-1.5 ${isATM ? "text-blue-400 font-black text-sm" : "text-gray-400 font-bold text-xs"}`}>
                      {row.strike}
                      {isATM && <div className="text-[8px] text-blue-600 font-normal">ATM</div>}
                    </td>

                    {/* PUT */}
                    <td className={`${isITMPut ? "bg-emerald-950/10" : ""}`}>
                      <ActionablePriceCell
                        typeCEPE="PE" strike={row.strike}
                        price={row.pe.ltp} chp={row.pe.chp}
                        oi={row.pe.oi} vol={row.pe.vol}
                        onAddLeg={addLeg} selectedLegs={selectedLegs}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Basket ── */}
      {selectedLegs.length > 0 && (
        <div className="shrink-0 border-t border-blue-500/20 bg-[#0a0a0c] p-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedLegs.map((leg, i) => (
              <div key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border ${
                leg.type === "BUY" ? "border-blue-500/40 text-blue-400" : "border-red-500/40 text-red-400"
              }`}>
                <span>{leg.type}</span>
                <span className="text-gray-500">{leg.strike}{leg.optionType}</span>
                <span className="text-gray-600">@{leg.price?.toFixed(2)}</span>
                <span className="text-gray-700 text-[8px]">×{leg.qty}</span>
                <button onClick={() => setSelectedLegs(selectedLegs.filter((_, j) => j !== i))}
                  className="ml-0.5 text-gray-700 hover:text-white">×</button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2 text-[10px] text-gray-500">
            <div className="flex gap-4">
              <span>Premium:
                <span className={`ml-1 font-bold font-mono ${totalPremium >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalPremium >= 0 ? "+" : ""}&#8377;{totalPremium.toFixed(2)}
                </span>
              </span>
              <span>Max P&amp;L:
                <span className={`ml-1 font-bold font-mono ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalPnL >= 0 ? "+" : ""}&#8377;{totalPnL.toFixed(0)}
                </span>
              </span>
            </div>
            <button onClick={() => setSelectedLegs([])} className="text-gray-700 hover:text-red-400 transition-all">
              Clear All
            </button>
          </div>

          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg font-black uppercase text-xs tracking-widest transition-all"
          >
            {isExecuting ? "Executing..." : `Execute ${selectedLegs.length} Legs · ${lots} Lot${lots > 1 ? "s" : ""} · ${totalQty} Qty`}
          </button>
        </div>
      )}
    </div>
  );
};

export default OptionChain;