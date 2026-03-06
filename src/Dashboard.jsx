import React, { useState, useEffect, useRef } from "react";
import { Activity, Shield, Layers, TrendingUp, TrendingDown, Wifi, WifiOff, CheckCircle, AlertCircle, Clock } from "lucide-react";
import io from "socket.io-client";
import OptionChain from "./OptionChain";
import logo from "./assets/logo.png";

const socket = io("https://api.mariaalgo.online");

const LOG_STYLE = {
  success: "text-emerald-400",
  error:   "text-red-400",
  warn:    "text-yellow-400",
  info:    "text-gray-400",
};

const STRATEGY_BADGE = {
  TRAFFIC: { label: "TL", cls: "bg-emerald-500/20 text-emerald-400" },
  CONDOR:  { label: "IC", cls: "bg-yellow-500/20 text-yellow-400"  },
};

// Stat card used inside Traffic Light panel
const Stat = ({ label, value, valueClass = "text-white", sub }) => (
  <div className="bg-gray-900/60 rounded-xl p-3">
    <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-1">{label}</div>
    <div className={`font-black text-xl font-mono ${valueClass}`}>{value}</div>
    {sub && <div className="text-[9px] text-gray-400 mt-1">{sub}</div>}
  </div>
);

// PnL source pill shown in history table
const PnlSourcePill = ({ source }) => {
  if (!source) return null;
  const isActual = source === "FYERS_ACTUAL";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wide ${
      isActual
        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20"
        : "bg-orange-500/15 text-orange-400 border border-orange-500/20"
    }`}>
      {isActual ? "✓ Actual" : "~ Est."}
    </span>
  );
};

// Server connection status dot in header
const ConnectionStatus = ({ connected }) => (
  <div className="flex items-center gap-1.5">
    {connected
      ? <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[9px] text-emerald-500 uppercase tracking-widest font-bold">Live</span></>
      : <><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><span className="text-[9px] text-red-500 uppercase tracking-widest font-bold">Disconnected</span></>
    }
  </div>
);

const Dashboard = () => {
  const [showOptionChain, setShowOptionChain] = useState(false);
  const [condorData,  setCondorData]  = useState([]);
  const [trafficData, setTrafficData] = useState({
    signal: "WAITING", livePnL: "0.00", direction: null,
    entryPrice: 0, stopLoss: "0.00", trailingActive: false,
    breakoutHigh: 0, breakoutLow: 0,
  });
  const [history,   setHistory]   = useState([]);
  const [logs,      setLogs]      = useState([]);
  const [logFilter, setLogFilter] = useState("ALL");
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const logsEndRef = useRef(null);

  // ── Data Polling ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [tRes, cRes, hRes] = await Promise.all([
          fetch("https://api.mariaalgo.online/api/traffic/status"),
          fetch("https://api.mariaalgo.online/api/condor/positions"),
          fetch("https://api.mariaalgo.online/api/history"),
        ]);
        if (tRes.ok) setTrafficData(await tRes.json());
        if (cRes.ok) setCondorData(await cRes.json());
        if (hRes.ok) setHistory(await hRes.json());
        setLastUpdate(new Date());
      } catch (err) { console.error("❌ Fetch Error:", err); }
    };
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, []);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("market_tick", (data) => {
      // Only use spot-based estimate when no option LTP is available yet
      setTrafficData((prev) => {
        if (prev.signal !== "ACTIVE" || !prev.direction || !prev.entryPrice || prev._optionLtpReceived) return prev;
        const pts = prev.direction === "CE"
          ? data.price - prev.entryPrice
          : prev.entryPrice - data.price;
        return { ...prev, livePnL: (pts * 65).toFixed(2), pnlSource: "spot" };
      });
    });

    // Real option premium P&L — emitted by fyersLiveData when option symbol ticks
    socket.on("option_tick", (data) => {
      setTrafficData((prev) => {
        if (prev.signal !== "ACTIVE") return prev;
        return {
          ...prev,
          livePnL: data.pnl,
          optionLtp: data.ltp,
          pnlSource: "option",
          _optionLtpReceived: true,
        };
      });
    });

    socket.on("trade_log", (entry) => {
      setLogs((prev) => [...prev, entry].slice(-200));
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("market_tick");
      socket.off("option_tick");
      socket.off("trade_log");
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (showOptionChain) return <OptionChain onClose={() => setShowOptionChain(false)} />;

  const pnl = parseFloat(trafficData.livePnL);
  const filteredLogs = logFilter === "ALL" ? logs : logs.filter(l => l.strategy === logFilter);

  // Classify log lines that relate to order fill / PnL source so we can style them
  const classifyLog = (msg = "") => {
    if (msg.includes("fully filled"))           return "fill";
    if (msg.includes("FYERS_ACTUAL"))           return "actual";
    if (msg.includes("ESTIMATED_SPOT"))         return "estimate";
    if (msg.includes("fill not confirmed"))     return "warn";
    if (msg.includes("Unhandled Rejection") || msg.includes("Uncaught Exception")) return "crash";
    return null;
  };

  return (
    <div className="min-h-screen bg-[#060608] text-gray-100 font-sans">

      {/* ── Header ── */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800/60">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Logo" className="w-9 h-9 bg-emerald-500 rounded-lg p-1" />
          <h1 className="text-xl font-black uppercase tracking-wider">
            Maria <span className="text-emerald-500">Algo</span>
          </h1>
          <ConnectionStatus connected={connected} />
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[9px] text-gray-500 font-mono hidden sm:block">
              updated {lastUpdate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
            </span>
          )}
          <button
            onClick={() => setShowOptionChain(true)}
            className="flex items-center gap-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
          >
            <Layers size={14} /> Option Chain
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* ── Iron Condor Table ── */}
        <div className="bg-[#0a0a0c] border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800/60">
            <Shield size={13} className="text-yellow-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live Iron Condor</span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[9px] uppercase text-gray-400 border-b border-gray-800">
                <th className="py-2 px-5 text-center">Side</th>
                <th className="py-2 text-center">Entry</th>
                <th className="py-2 text-center">Live</th>
                <th className="py-2 text-center">70% Exit</th>
                <th className="py-2 text-center">Firefight</th>
                <th className="py-2 text-center">Stop Loss</th>
                <th className="py-2 text-center">Qty</th>
                <th className="py-2 pr-5 text-right">PnL</th>
              </tr>
            </thead>
            <tbody>
              {condorData.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="flex flex-col items-center justify-center gap-2 py-7">
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-yellow-600/50" />
                        <span className="text-yellow-600/60 text-xs font-black uppercase tracking-widest">
                          Scanning for Setup
                        </span>
                      </div>
                      <div className="text-gray-500 text-[10px]">No iron condor position active — strategy is idle</div>
                    </div>
                  </td>
                </tr>
              ) : condorData[0].status === "COMPLETED" ? (
                <tr>
                  <td colSpan={8} className="py-6 px-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-gray-700/40 text-gray-500 uppercase">Completed</span>
                        <span className="text-gray-400 text-xs font-mono">{condorData[0].index}</span>
                        <span className="text-gray-400 text-xs">{condorData[0].exitReason?.replace(/_/g, " ")}</span>
                      </div>
                      <span className={`font-black text-lg font-mono ${parseFloat(condorData[0].totalPnL) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ₹{condorData[0].totalPnL}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : condorData.map((row, i) => (
                <React.Fragment key={i}>
                  <tr className="border-b border-gray-800/30">
                    <td className="py-3 px-5 text-center text-red-400 text-[10px] font-black">CALL</td>
                    <td className="text-center font-mono text-xs">₹{row.call.entry}</td>
                    <td className="text-center font-mono text-xs">₹{row.call.current}</td>
                    <td className="text-center font-mono text-xs text-emerald-500">₹{row.call.profit70}</td>
                    <td className="text-center font-mono text-xs text-orange-400">₹{row.call.firefight}</td>
                    <td className="text-center font-mono text-xs text-red-400">₹{row.call.sl}</td>
                    <td className="text-center font-bold text-sm" rowSpan="2">{row.quantity}</td>
                    <td className={`text-right pr-5 font-black text-base ${parseFloat(row.totalPnL) >= 0 ? "text-emerald-400" : "text-red-400"}`} rowSpan="2">
                      ₹{row.totalPnL}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 text-center text-emerald-400 text-[10px] font-black">PUT</td>
                    <td className="text-center font-mono text-xs">₹{row.put.entry}</td>
                    <td className="text-center font-mono text-xs">₹{row.put.current}</td>
                    <td className="text-center font-mono text-xs text-emerald-500">₹{row.put.profit70}</td>
                    <td className="text-center font-mono text-xs text-orange-400">₹{row.put.firefight}</td>
                    <td className="text-center font-mono text-xs text-red-400">₹{row.put.sl}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Two Panel: Traffic Light + Live Logs ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT: Traffic Light */}
          <div className="bg-[#0a0a0c] border border-gray-800 rounded-2xl p-5 shadow-xl flex flex-col" style={{ minHeight: "280px" }}>
            <div className="flex items-center gap-2 mb-4 border-b border-gray-800/60 pb-3">
              <Activity size={13} className="text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Traffic Light</span>
              <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                trafficData.signal === "ACTIVE" ? "bg-emerald-500/20 text-emerald-400" :
                trafficData.signal === "CLOSED" ? "bg-gray-700/40 text-gray-500" :
                                                  "bg-yellow-500/10 text-yellow-500"
              }`}>{trafficData.signal}</span>
            </div>

            {trafficData.signal === "ACTIVE" ? (
              <div className="grid grid-cols-2 gap-3 flex-1">
                <Stat
                  label="Direction"
                  value={
                    <span className="flex items-center gap-1">
                      {trafficData.direction === "CE" ? <TrendingUp size={16}/> : <TrendingDown size={16}/>}
                      {trafficData.direction}
                    </span>
                  }
                  valueClass={trafficData.direction === "CE" ? "text-emerald-400" : "text-red-400"}
                />
                <Stat label="Entry Spot" value={trafficData.entryPrice} />
                <Stat
                  label="Live P&L"
                  value={`₹${trafficData.livePnL}`}
                  valueClass={pnl >= 0 ? "text-emerald-400" : "text-red-400"}
                  sub={
                    trafficData.pnlSource === "option"
                      ? `option LTP ₹${trafficData.optionLtp ?? "—"} · actual premium`
                      : "spot estimate · awaiting option tick"
                  }
                />
                <Stat
                  label={trafficData.trailingActive ? "Trail SL 🔒" : "Stop Loss"}
                  value={trafficData.stopLoss}
                  valueClass={trafficData.trailingActive ? "text-emerald-400" : "text-red-400"}
                />
                {trafficData.breakoutHigh > 0 && <>
                  <Stat label="Breakout High" value={trafficData.breakoutHigh} valueClass="text-gray-300" />
                  <Stat label="Breakout Low"  value={trafficData.breakoutLow}  valueClass="text-gray-300" />
                </>}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4">
                <div className={`text-5xl font-black ${trafficData.signal === "CLOSED" ? "text-gray-500" : "text-yellow-500/40"}`}>
                  {trafficData.signal}
                </div>
                {trafficData.breakoutHigh > 0 && (
                  <div className="grid grid-cols-2 gap-3 w-full mt-2">
                    <Stat label="Breakout High" value={trafficData.breakoutHigh} valueClass="text-gray-300" />
                    <Stat label="Breakout Low"  value={trafficData.breakoutLow}  valueClass="text-gray-300" />
                  </div>
                )}
                <div className="text-gray-400 text-xs">
                  {trafficData.signal === "CLOSED" ? "Trade completed for today" : "Waiting for range lock..."}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Live Logs */}
          <div className="bg-[#0a0a0c] border border-gray-800 rounded-2xl flex flex-col shadow-xl" style={{ height: "340px" }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800/60 shrink-0">
              <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live Logs</span>
              <div className="ml-auto flex items-center gap-1">
                {["ALL", "TRAFFIC", "CONDOR"].map(f => (
                  <button key={f} onClick={() => setLogFilter(f)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                      logFilter === f
                        ? f === "TRAFFIC" ? "bg-emerald-500/20 text-emerald-400"
                          : f === "CONDOR" ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-gray-700 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}>{f}</button>
                ))}
                {logs.length > 0 && (
                  <button onClick={() => setLogs([])}
                    className="px-2 py-0.5 rounded text-[9px] text-gray-500 hover:text-red-400 ml-1 transition-all">
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10px] space-y-1">
              {filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                  No logs yet...
                </div>
              ) : filteredLogs.map((log, i) => {
                const badge = STRATEGY_BADGE[log.strategy];
                const kind  = classifyLog(log.msg);
                // Special row styles for key events
                const rowCls = kind === "fill"     ? "bg-emerald-500/5 rounded px-1"
                             : kind === "actual"   ? "bg-emerald-500/5 rounded px-1"
                             : kind === "estimate" ? "bg-orange-500/5 rounded px-1"
                             : kind === "crash"    ? "bg-red-500/10 rounded px-1 border-l-2 border-red-500/40"
                             : "";
                return (
                  <div key={i} className={`flex items-start gap-2 leading-relaxed ${rowCls}`}>
                    <span className="text-gray-500 shrink-0">{log.time}</span>
                    {badge && (
                      <span className={`shrink-0 px-1 rounded text-[8px] font-black ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                    {/* Order fill confirmed icon */}
                    {kind === "fill" && <CheckCircle size={10} className="text-emerald-500 shrink-0 mt-0.5" />}
                    {kind === "crash" && <AlertCircle size={10} className="text-red-400 shrink-0 mt-0.5" />}
                    <span className={LOG_STYLE[log.level] || "text-gray-400"}>{log.msg}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* ── Trade History ── */}
        {history.length > 0 && (
          <div className="bg-[#0a0a0c] border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800/60">
              <TrendingUp size={13} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Trade History</span>
              {/* Legend for PnL source */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[8px] text-gray-500 uppercase tracking-wide">PnL source:</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">✓ Actual</span>
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/20">~ Est.</span>
              </div>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] uppercase text-gray-400 border-b border-gray-800">
                  <th className="py-2 px-5">Strategy</th>
                  <th className="py-2">Symbol</th>
                  <th className="py-2">Exit Reason</th>
                  <th className="py-2 text-center">PnL Source</th>
                  <th className="py-2 pr-5 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  // Extract PnL source from notes field if present
                  const sourceMatch = h.notes?.match(/PnL Source:\s*(FYERS_ACTUAL|ESTIMATED_SPOT)/);
                  const pnlSource = sourceMatch?.[1] || null;
                  return (
                    <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-900/20 transition-colors">
                      <td className="py-3 px-5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                          h.strategy === "IRON_CONDOR" ? "bg-yellow-500/20 text-yellow-400" : "bg-emerald-500/20 text-emerald-400"
                        }`}>{h.strategy === "IRON_CONDOR" ? "IC" : "TL"}</span>
                      </td>
                      <td className="font-mono text-xs text-gray-300">{h.symbol}</td>
                      <td className="text-xs text-gray-400">{h.exitReason?.replace(/_/g, " ")}</td>
                      <td className="text-center">
                        <PnlSourcePill source={pnlSource} />
                      </td>
                      <td className={`pr-5 text-right font-black text-sm ${parseFloat(h.pnl) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ₹{parseFloat(h.pnl).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;