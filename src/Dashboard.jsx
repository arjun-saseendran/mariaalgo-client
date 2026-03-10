import React, { useState, useEffect, useRef } from "react";
import {
  Activity,
  Shield,
  Layers,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
  Radio,
  BarChart2,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import io from "socket.io-client";
import OptionChain from "./OptionChain";
import logo from "./assets/logo.png";

// Iron Condor server (port 3002) — condor positions, auto-condor, options, socket
const IC_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : "https://mariaalgo.online";

// Traffic Light server (port 3001) — proxied under /tl/ by nginx
const TL_URL = import.meta.env.VITE_TRAFFIC_URL
  ? import.meta.env.VITE_TRAFFIC_URL
  : "https://mariaalgo.online/tl";

const socket = io(IC_URL, { withCredentials: true });

const LOG_STYLE = {
  success: "text-emerald-400",
  error:   "text-red-400",
  warn:    "text-amber-400",
  info:    "text-slate-400",
};

const STRATEGY_BADGE = {
  TRAFFIC: { label: "TL",  cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" },
  CONDOR:  { label: "IC",  cls: "bg-amber-500/15 text-amber-400 border border-amber-500/20" },
};

/* ── Tiny reusable components ─────────────────────────────────────────────── */

const Pip = ({ active, color = "emerald" }) => (
  <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? `bg-${color}-500 animate-pulse` : "bg-slate-700"}`} />
);

const Tag = ({ children, variant = "neutral" }) => {
  const variants = {
    neutral:  "bg-slate-800 text-slate-400 border-slate-700",
    success:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    danger:   "bg-red-500/10 text-red-400 border-red-500/25",
    warning:  "bg-amber-500/10 text-amber-400 border-amber-500/25",
    info:     "bg-blue-500/10 text-blue-400 border-blue-500/25",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${variants[variant]}`}>
      {children}
    </span>
  );
};

const StatCard = ({ label, value, valueClass = "text-white", sub, accent }) => (
  <div className={`relative rounded-xl p-3.5 bg-[#0d0d10] border ${accent ? "border-" + accent + "-500/20" : "border-slate-800/60"} overflow-hidden group transition-all hover:border-slate-700`}>
    {accent && <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-${accent}-500/40 to-transparent`} />}
    <div className="text-[9px] text-slate-500 uppercase tracking-[0.12em] mb-1.5 font-semibold">{label}</div>
    <div className={`font-black text-lg font-mono leading-none ${valueClass}`}>{value}</div>
    {sub && <div className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">{sub}</div>}
  </div>
);

const SectionHeader = ({ icon: Icon, title, iconColor = "text-slate-400", right }) => (
  <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-800/60">
    <Icon size={12} className={iconColor} />
    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">{title}</span>
    {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
  </div>
);

const PnlSourcePill = ({ source }) => {
  if (!source) return null;
  return source === "kite"
    ? <Tag variant="success">✓ Kite</Tag>
    : <Tag variant="warning">~ Est.</Tag>;
};

/* ── Feed status indicator ────────────────────────────────────────────────── */
const FeedDot = ({ status }) => {
  const cfg = {
    ok:         { dot: "bg-emerald-500",  text: "text-emerald-500", label: "Live" },
    error:      { dot: "bg-red-500",      text: "text-red-500",     label: "Down" },
    connecting: { dot: "bg-amber-500",    text: "text-amber-500",   label: "…" },
  }[status] || { dot: "bg-slate-600", text: "text-slate-500", label: "—" };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.dot}`} />
      <span className={`text-[9px] font-black uppercase tracking-widest ${cfg.text}`}>{cfg.label}</span>
    </div>
  );
};

/* ── Main Dashboard ───────────────────────────────────────────────────────── */
const Dashboard = () => {
  const [showOptionChain, setShowOptionChain] = useState(false);
  const [condorData,      setCondorData]      = useState([]);
  const [trafficData,     setTrafficData]     = useState({
    signal: "WAITING", livePnL: "0.00", direction: null, entryPrice: 0,
    stopLoss: "0.00", trailingActive: false, breakoutHigh: 0, breakoutLow: 0, exitReason: null,
  });
  const [history,       setHistory]       = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [logFilter,     setLogFilter]     = useState("ALL");
  const [connected,     setConnected]     = useState(false);
  const [lastUpdate,    setLastUpdate]    = useState(null);
  const [feedStatus,  setFeedStatus]  = useState("connecting");
  const [feedError,   setFeedError]   = useState(null);
  const [autoMode,      setAutoMode]      = useState(false);
  const [autoStatus,    setAutoStatus]    = useState(null);
  const [autoToggling,  setAutoToggling]  = useState(false);
  // ✅ FIX: autoArmed persists the user's intent across 5s polls.
  // entryDone=false means "not yet entered" — it doesn't mean "user turned it off".
  // Without this, the toggle flips back OFF on the next poll whenever market is
  // closed or it's not entry day (Sunday, holiday, wrong weekday).
  const autoArmedRef = useRef(false);
  const logsEndRef = useRef(null);

  /* ── Data polling ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [tRes, cRes, hRes, aRes] = await Promise.all([
          fetch(`${TL_URL}/api/traffic/status`),        // Traffic Light server
          fetch(`${IC_URL}/api/condor/positions`),      // Iron Condor server
          fetch(`${IC_URL}/api/history`),               // Iron Condor server
          fetch(`${IC_URL}/api/auto-condor/status`),    // Iron Condor server
        ]);
        if (tRes.ok) setTrafficData(await tRes.json());
        if (cRes.ok) {
          // ✅ FIX 1: /api/condor/positions returns a single object (or null), not an array.
          // Wrap in array so the rest of the render logic (condorData[0], condorData.length) still works.
          const raw   = await cRes.json();
          const cData = raw ? [raw] : [];
          setCondorData(cData);
          const marketHours = (() => {
            const now  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const mins = now.getHours() * 60 + now.getMinutes();
            return now.getDay() >= 1 && now.getDay() <= 5 && mins >= 555 && mins < 930;
          })();
          if (marketHours && cData.length > 0 && cData[0].status !== "COMPLETED") {
            const allZero = ["call","put"].every(s => parseFloat(cData[0]?.[s]?.current) === 0);
            setFeedStatus(allZero ? "error" : "ok");
            setFeedError(allZero ? "Live prices unavailable — Kite WebSocket feed down" : null);
          } else { setFeedStatus("ok"); setFeedError(null); }
        }
        if (hRes.ok) setHistory(await hRes.json());
  if (aRes.ok) {
    const d = await aRes.json();
    // ✅ armed is now a real server-side flag — sync directly from it
    if (!autoArmedRef.current) {
      setAutoMode(d.armed === true);
    }
    setAutoStatus(d);
  }
        setLastUpdate(new Date());
      } catch {}
    };
    fetchAll();
    const iv = setInterval(fetchAll, 5000);
    return () => clearInterval(iv);
  }, []);

  /* ── Socket ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("upstox_status", ({ status, message }) => { setFeedStatus(status); setFeedError(status === "error" ? message : null); });
    socket.on("auto_condor_tick", d => setAutoStatus(d));
    socket.on("market_tick", data => {
      setTrafficData(prev => {
        if (prev.signal !== "ACTIVE" || !prev.direction || !prev.entryPrice || prev._optionLtpReceived) return prev;
        const pts = prev.direction === "CE" ? data.price - prev.entryPrice : prev.entryPrice - data.price;
        return { ...prev, livePnL: (pts * 65).toFixed(2), pnlSource: "spot" };
      });
    });
    socket.on("option_tick", data => {
      setTrafficData(prev => {
        if (prev.signal !== "ACTIVE") return prev;
        return { ...prev, livePnL: data.pnl, optionLtp: data.ltp, pnlSource: "option", _optionLtpReceived: true };
      });
    });
    socket.on("trade_log", entry => setLogs(prev => [...prev, entry].slice(-200)));
    return () => { ["connect","disconnect","upstox_status","auto_condor_tick","market_tick","option_tick","trade_log"].forEach(e => socket.off(e)); };
  }, []);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  if (showOptionChain) return <OptionChain onClose={() => setShowOptionChain(false)} />;

  const pnl = parseFloat(trafficData.livePnL);
  const filteredLogs = logFilter === "ALL" ? logs : logs.filter(l => l.strategy === logFilter);

  const classifyLog = (msg = "") => {
    if (msg.includes("fully filled"))      return "fill";
    if (msg.includes("FYERS_ACTUAL"))      return "actual";
    if (msg.includes("ESTIMATED_SPOT"))    return "estimate";
    if (msg.includes("fill not confirmed")) return "warn";
    if (msg.includes("Unhandled Rejection") || msg.includes("Uncaught Exception")) return "crash";
    return null;
  };

  // ✅ FIX 3: /api/auto-condor has no activate/deactivate endpoints.
  // Use /reset to reset day state (clears entryDone so auto-entry can re-run).
  const toggleAutoMode = async () => {
    setAutoToggling(true);
    try {
      if (autoMode) {
        const res = await fetch(`${IC_URL}/api/auto-condor/reset`, { method: "POST" });
        if (res.ok) {
          autoArmedRef.current = false;
          setAutoMode(false);
          // ✅ Clear condor logs so stale "armed but waiting" messages don't linger
          setLogs(prev => prev.filter(l => l.strategy !== "CONDOR"));
        }
      } else {
        // Trigger immediate entry check (will no-op on holidays/wrong day — that's correct)
        const res = await fetch(`${IC_URL}/api/auto-condor/trigger`, { method: "POST" });
        if (res.ok) {
          // Arm the toggle — stays ON even if today is not entry day
          autoArmedRef.current = true;
          setAutoMode(true);
        }
      }
    } catch {}
    finally { setAutoToggling(false); }
  };

  /* ── Condor row values ──────────────────────────────────────────────────── */
  const row = condorData[0];
  // ✅ FIX 4: API returns `pnl`, not `totalPnL`
  const condorPnlVal  = row ? parseFloat(row.pnl) : 0;
  const condorPnlPos  = condorPnlVal >= 0;

  return (
    <div className="min-h-screen bg-[#07070a] text-slate-100" style={{ fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}>

      {/* ── Scanline overlay ── */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.015]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.8) 2px, rgba(255,255,255,0.8) 3px)" }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-[#08080c]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={logo} alt="Logo" className="w-8 h-8 rounded-lg" />
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#08080c] ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.2em] leading-none">
              Maria<span className="text-emerald-500">Algo</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[8px] font-bold uppercase tracking-widest ${connected ? "text-emerald-600" : "text-red-600"}`}>
                {connected ? "● Connected" : "○ Offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="hidden sm:block text-[9px] text-slate-600 font-mono">
              {lastUpdate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
            </span>
          )}
          <button
            onClick={() => setShowOptionChain(true)}
            className="flex items-center gap-2 bg-blue-600/8 hover:bg-blue-600/15 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
          >
            <Layers size={12} />
            Chain
          </button>
        </div>
      </header>

      <div className="relative z-10 p-5 space-y-4 max-w-screen-xl mx-auto">

        {/* ── Feed alert ─────────────────────────────────────────────────── */}
        {feedStatus === "error" && (
          <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/25 rounded-xl px-4 py-3">
            <AlertTriangle size={13} className="text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-red-400 text-[10px] font-black uppercase tracking-widest">Kite Feed Down</span>
              <p className="text-red-500/60 text-[9px] mt-0.5">{feedError || "Iron Condor live prices unavailable — reconnecting…"}</p>
            </div>
            <span className="text-[8px] text-red-600/50 font-mono shrink-0">auto-reconnect</span>
          </div>
        )}
        {feedStatus === "connecting" && connected && (
          <div className="flex items-center gap-3 bg-amber-500/6 border border-amber-500/15 rounded-xl px-4 py-3">
            <Clock size={12} className="text-amber-500 shrink-0" />
            <span className="text-amber-500/80 text-[10px] font-bold">Connecting to Kite feed…</span>
          </div>
        )}

        {/* ── Iron Condor Panel ──────────────────────────────────────────── */}
        <div className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden shadow-2xl">
          <SectionHeader
            icon={Shield}
            title="Iron Condor"
            iconColor="text-amber-500/80"
            right={
              <>
                {/* Auto mode toggle */}
                <button
                  onClick={toggleAutoMode}
                  disabled={autoToggling}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                    autoMode
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/18"
                      : "bg-slate-800/60 border-slate-700/60 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  } ${autoToggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Zap size={10} className={autoMode ? "text-emerald-400" : "text-slate-600"} />
                  {autoToggling ? "…"
                    : autoMode
                      ? (autoStatus?.entryDone ? "Auto ACTIVE" : "Auto ARMED")
                      : "Auto OFF"}
                  {autoMode && autoStatus?.gapOpenHold && (
                    <span className="ml-1 text-amber-400/80">Hold</span>
                  )}
                </button>
                <FeedDot status={feedStatus} />
              </>
            }
          />

          {condorData.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <Shield size={18} className="text-slate-700" />
              <span className="text-slate-600 text-[10px] uppercase tracking-[0.15em] font-black">Scanning for Setup</span>
              <span className="text-slate-700 text-[9px]">No active position — strategy idle</span>
            </div>

          ) : condorData[0].status === "COMPLETED" ? (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Tag variant="neutral">Completed</Tag>
                <span className="text-slate-400 text-xs font-mono">{condorData[0].index}</span>
                <span className="text-slate-500 text-xs">{condorData[0].exitReason?.replace(/_/g, " ")}</span>
              </div>
              <span className={`font-black text-lg font-mono ${condorPnlPos ? "text-emerald-400" : "text-red-400"}`}>
                {/* ✅ FIX 4: API field is `pnl` not `totalPnL` */}
                ₹{condorData[0].pnl}
              </span>
            </div>

          ) : (
            <div className="p-4">
              {condorData.map((row, i) => {
                const rowPnl    = parseFloat(row.pnl);  // ✅ FIX 4: was row.totalPnL
                const pnlPos    = rowPnl >= 0;
                const callLive  = parseFloat(row.call.current);
                const putLive   = parseFloat(row.put.current);
                const callEntry = parseFloat(row.call.entry);
                const putEntry  = parseFloat(row.put.entry);
                const callPct   = callEntry > 0 ? (callLive / callEntry) * 100 : 0;
                const putPct    = putEntry  > 0 ? (putLive  / putEntry)  * 100 : 0;

                return (
                  <div key={i} className="space-y-3">
                    {/* Summary bar */}
                    <div className="flex items-center justify-between bg-[#0d0d10] rounded-xl px-4 py-3 border border-slate-800/50">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">Index</div>
                          <div className="text-sm font-black text-slate-300 font-mono">{row.index}</div>
                        </div>
                        <div className="w-px h-8 bg-slate-800" />
                        <div className="text-center">
                          <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">Qty</div>
                          <div className="text-sm font-black text-slate-300 font-mono">{row.quantity ?? "—"}</div>
                        </div>
                        <div className="w-px h-8 bg-slate-800" />
                        <div className="text-center">
                          <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">Booked</div>
                          <div className="text-sm font-black text-emerald-500 font-mono">₹{row.buffer}</div>
                        </div>
                        {/* ✅ FIX 4: API field is `slCount` not `spreadSLCount` */}
                        {row.slCount > 0 && (
                          <>
                            <div className="w-px h-8 bg-slate-800" />
                            <div className="text-center">
                              <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">SL Hits</div>
                              <div className="text-sm font-black text-amber-400 font-mono">{row.slCount}</div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">Live P&L</div>
                        <div className={`text-2xl font-black font-mono ${feedStatus === "error" ? "text-slate-700" : pnlPos ? "text-emerald-400" : "text-red-400"}`}>
                          {/* ✅ FIX 4: API field is `pnl` not `totalPnL` */}
                          {feedStatus === "error" ? "—" : `₹${row.pnl}`}
                        </div>
                      </div>
                    </div>

                    {/* Legs grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* CALL leg */}
                      <div className="bg-[#0d0d10] border border-red-900/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={11} className="text-red-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-red-400">Call Spread</span>
                          </div>
                          <Tag variant="danger">SHORT</Tag>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Entry</div>
                            <div className="font-mono text-xs font-bold text-slate-300">₹{row.call.entry}</div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Live</div>
                            <div className={`font-mono text-xs font-bold ${feedStatus === "error" ? "text-slate-700" : ""}`}>
                              {feedStatus === "error" ? "—" : `₹${row.call.current}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">SL</div>
                            <div className="font-mono text-xs font-bold text-red-400">₹{row.call.sl}</div>
                          </div>
                        </div>
                        {/* Decay progress bar */}
                        <div>
                          <div className="flex justify-between text-[8px] text-slate-600 mb-1">
                            <span>Decay</span>
                          {/* ✅ FIX 4: API field is `ff3x` not `firefightLevel` */}
                            <span className="text-emerald-600">FF ₹{row.call.ff3x}</span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.min(100, Math.max(0, 100 - callPct))}%`,
                                background: callPct < 40 ? "#34d399" : callPct < 70 ? "#fbbf24" : "#f87171"
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* PUT leg */}
                      <div className="bg-[#0d0d10] border border-emerald-900/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingDown size={11} className="text-emerald-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Put Spread</span>
                          </div>
                          <Tag variant="success">SHORT</Tag>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Entry</div>
                            <div className="font-mono text-xs font-bold text-slate-300">₹{row.put.entry}</div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">Live</div>
                            <div className={`font-mono text-xs font-bold ${feedStatus === "error" ? "text-slate-700" : ""}`}>
                              {feedStatus === "error" ? "—" : `₹${row.put.current}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">SL</div>
                            <div className="font-mono text-xs font-bold text-red-400">₹{row.put.sl}</div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[8px] text-slate-600 mb-1">
                            <span>Decay</span>
                            {/* ✅ FIX 4: API field is `ff3x` not `firefightLevel` */}
                            <span className="text-emerald-600">FF ₹{row.put.ff3x}</span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.min(100, Math.max(0, 100 - putPct))}%`,
                                background: putPct < 40 ? "#34d399" : putPct < 70 ? "#fbbf24" : "#f87171"
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ✅ FIX 6: Show firefight/butterfly pending banners — API sends these flags but UI never rendered them */}
                    {row.firefightPending && (
                      <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2">
                        <Zap size={11} className="text-amber-400" />
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                          Firefight Pending — {row.firefightSide?.toUpperCase()} side
                        </span>
                        {/* ✅ FIX: added action button — semi-auto user was seeing the alert with no way to act */}
                        <button
                          onClick={async () => {
                            if (!window.confirm("Execute firefight now?")) return;
                            const res = await fetch(`${IC_URL}/api/trades/firefight`, { method: "POST" });
                            if (!res.ok) alert("Firefight failed: " + (await res.json().catch(()=>({}))).error);
                          }}
                          className="ml-auto px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-md transition-all"
                        >
                          Execute ⚡
                        </button>
                      </div>
                    )}
                    {row.butterflyPending && !row.isButterfly && (
                      <div className="flex items-center gap-2 bg-purple-500/8 border border-purple-500/25 rounded-lg px-3 py-2">
                        <Activity size={11} className="text-purple-400" />
                        <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">
                          Butterfly Conversion Pending — Sell leg at ATM + SL hit
                        </span>
                        {/* ✅ FIX: added action button — semi-auto user was seeing the alert with no way to act */}
                        <button
                          onClick={async () => {
                            if (!window.confirm("Convert to Iron Butterfly now?")) return;
                            const res = await fetch(`${IC_URL}/api/trades/butterfly`, { method: "POST" });
                            if (!res.ok) alert("Butterfly failed: " + (await res.json().catch(()=>({}))).error);
                          }}
                          className="ml-auto px-3 py-1 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 text-[9px] font-black uppercase tracking-widest rounded-md transition-all"
                        >
                          Convert 🦋
                        </button>
                      </div>
                    )}
                    {/* Butterfly SL badge */}
                    {row.isButterfly && (
                      <div className="flex items-center gap-2 bg-purple-500/8 border border-purple-500/20 rounded-lg px-3 py-2">
                        <Activity size={11} className="text-purple-400" />
                        <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Iron Butterfly</span>
                        <span className="text-[9px] text-slate-500 ml-auto">SL ₹{row.butterflySL}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Two-panel row ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* LEFT: Traffic Light */}
          <div className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden shadow-xl">
            <SectionHeader
              icon={Radio}
              title="Traffic Light"
              iconColor="text-emerald-500/80"
              right={
                <Tag variant={
                  trafficData.signal === "ACTIVE" ? "success" :
                  trafficData.signal === "CLOSED" ? "neutral" : "warning"
                }>
                  {trafficData.signal}
                </Tag>
              }
            />

            <div className="p-4">
              {trafficData.signal === "ACTIVE" ? (
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    label="Direction"
                    accent={trafficData.direction === "CE" ? "emerald" : "red"}
                    value={
                      <span className="flex items-center gap-1.5">
                        {trafficData.direction === "CE"
                          ? <TrendingUp size={14} className="text-emerald-400" />
                          : <TrendingDown size={14} className="text-red-400" />
                        }
                        {trafficData.direction}
                      </span>
                    }
                    valueClass={trafficData.direction === "CE" ? "text-emerald-400" : "text-red-400"}
                  />
                  <StatCard label="Entry Spot" value={trafficData.entryPrice} valueClass="text-slate-200" />
                  <StatCard
                    label="Live P&L"
                    accent={pnl >= 0 ? "emerald" : "red"}
                    value={`₹${trafficData.livePnL}`}
                    valueClass={pnl >= 0 ? "text-emerald-400" : "text-red-400"}
                    sub={trafficData.pnlSource === "option"
                      ? `option LTP ₹${trafficData.optionLtp ?? "—"} · actual`
                      : "spot estimate · awaiting option tick"}
                  />
                  <StatCard
                    label={trafficData.trailingActive ? "Trail SL 🔒" : "Stop Loss"}
                    accent={trafficData.trailingActive ? "emerald" : "red"}
                    value={trafficData.stopLoss}
                    valueClass={trafficData.trailingActive ? "text-emerald-400" : "text-red-400"}
                  />
                  {trafficData.breakoutHigh > 0 && <>
                    <StatCard label="Range High" value={trafficData.breakoutHigh} valueClass="text-slate-300" />
                    <StatCard label="Range Low"  value={trafficData.breakoutLow}  valueClass="text-slate-300" />
                  </>}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-6">
                  <div className={`text-6xl font-black tracking-tighter ${
                    trafficData.signal === "CLOSED" ? "text-slate-700" : "text-amber-500/30"
                  }`}>
                    {trafficData.signal}
                  </div>
                  {trafficData.breakoutHigh > 0 && (
                    <div className="grid grid-cols-2 gap-3 w-full">
                      <StatCard label="Range High" value={trafficData.breakoutHigh} valueClass="text-slate-300" />
                      <StatCard label="Range Low"  value={trafficData.breakoutLow}  valueClass="text-slate-300" />
                    </div>
                  )}
                  <p className="text-slate-600 text-[10px] text-center">
                    {trafficData.signal === "CLOSED" ? (
                      <>
                        Trade completed
                        {trafficData.exitReason && (
                          <span className="ml-2">
                            <Tag variant="neutral">{trafficData.exitReason.replace(/_/g, " ")}</Tag>
                          </span>
                        )}
                      </>
                    ) : "Waiting for range lock…"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Live Logs */}
          <div className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden flex flex-col shadow-xl" style={{ height: 360 }}>
            <SectionHeader
              icon={BarChart2}
              title="Live Logs"
              iconColor={connected ? "text-emerald-500" : "text-red-500"}
              right={
                <div className="flex items-center gap-1">
                  {["ALL","TRAFFIC","CONDOR"].map(f => (
                    <button key={f} onClick={() => setLogFilter(f)}
                      className={`px-2.5 py-1 rounded-md text-[8px] font-black transition-all uppercase tracking-widest ${
                        logFilter === f
                          ? f === "TRAFFIC" ? "bg-emerald-500/15 text-emerald-400"
                          : f === "CONDOR"  ? "bg-amber-500/15 text-amber-400"
                          : "bg-slate-700 text-white"
                          : "text-slate-600 hover:text-slate-400"
                      }`}
                    >{f}</button>
                  ))}
                  {logs.length > 0 && (
                    <button onClick={() => setLogs([])}
                      className="px-2 py-1 rounded text-[8px] text-slate-600 hover:text-red-400 ml-1 transition-all">
                      Clear
                    </button>
                  )}
                </div>
              }
            />

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 font-mono text-[9.5px]">
              {filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-700 text-xs">No logs yet…</div>
              ) : filteredLogs.map((log, i) => {
                const badge = STRATEGY_BADGE[log.strategy];
                const kind  = classifyLog(log.msg);
                const rowCls = kind === "fill"     ? "bg-emerald-500/5 rounded px-1.5 border-l border-emerald-500/30"
                             : kind === "actual"   ? "bg-emerald-500/4 rounded px-1.5"
                             : kind === "estimate" ? "bg-amber-500/4 rounded px-1.5"
                             : kind === "crash"    ? "bg-red-500/8 rounded px-1.5 border-l border-red-500/40"
                             : "";
                return (
                  <div key={i} className={`flex items-start gap-2 leading-relaxed ${rowCls}`}>
                    <span className="text-slate-700 shrink-0">{log.time}</span>
                    {badge && <span className={`shrink-0 px-1.5 py-0.5 rounded text-[7px] font-black ${badge.cls}`}>{badge.label}</span>}
                    {kind === "fill"  && <CheckCircle size={9} className="text-emerald-500 shrink-0 mt-0.5" />}
                    {kind === "crash" && <AlertCircle size={9} className="text-red-400 shrink-0 mt-0.5" />}
                    <span className={LOG_STYLE[log.level] || "text-slate-500"}>{log.msg}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* ── Trade History ─────────────────────────────────────────────── */}
        {history.length > 0 && (
          <div className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden shadow-xl">
            <SectionHeader
              icon={TrendingUp}
              title="Trade History"
              iconColor="text-blue-400/70"
              right={
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-700 uppercase tracking-wider">PnL:</span>
                  <Tag variant="success">✓ Actual</Tag>
                  <Tag variant="warning">~ Est.</Tag>
                </div>
              }
            />
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8px] uppercase tracking-widest text-slate-700 border-b border-slate-800/60">
                  <th className="py-2.5 px-5">Strategy</th>
                  <th className="py-2.5">Symbol</th>
                  <th className="py-2.5">Exit Reason</th>
                  <th className="py-2.5 text-center">Source</th>
                  <th className="py-2.5 pr-5 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const srcMatch = h.notes?.match(/PnL Source:\s*(FYERS_ACTUAL|ESTIMATED_SPOT)/);
                  const pnlSrc   = srcMatch?.[1] || null;
                  const hPnl     = parseFloat(h.pnl);
                  return (
                    <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-900/20 transition-colors group">
                      <td className="py-3 px-5">
                        <Tag variant={h.strategy === "IRON_CONDOR" ? "warning" : "success"}>
                          {h.strategy === "IRON_CONDOR" ? "IC" : "TL"}
                        </Tag>
                      </td>
                      <td className="font-mono text-[10px] text-slate-400 group-hover:text-slate-300 transition-colors">
                        {h.symbol}
                      </td>
                      <td className="text-[10px] text-slate-600">
                        {h.exitReason?.replace(/_/g, " ")}
                      </td>
                      <td className="text-center">
                        <PnlSourcePill source={pnlSrc} />
                      </td>
                      <td className={`pr-5 text-right font-black text-sm font-mono ${hPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {hPnl >= 0 ? "+" : ""}₹{hPnl.toFixed(2)}
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