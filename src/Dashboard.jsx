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
  ArrowLeft,
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

// Control server (port 3003) — always running, manages start/stop of both engines
const CTRL_URL = import.meta.env.VITE_CONTROL_URL
  ? import.meta.env.VITE_CONTROL_URL
  : "https://mariaalgo.online/ctrl";

const socket    = io(IC_URL, { withCredentials: true });  // Iron Condor (port 3002)
const tlSocket  = io(TL_URL, { withCredentials: true });  // Traffic Light (port 3001)

const LOG_STYLE = {
  success: "text-emerald-400",
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-slate-400",
};

const STRATEGY_BADGE = {
  TRAFFIC: {
    label: "TL",
    cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  },
  CONDOR: {
    label: "IC",
    cls: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  },
};

/* ── Tiny reusable components ─────────────────────────────────────────────── */

const Pip = ({ active, color = "emerald" }) => (
  <span
    className={`inline-block w-1.5 h-1.5 rounded-full ${active ? `bg-${color}-500 animate-pulse` : "bg-slate-700"}`}
  />
);

const Tag = ({ children, variant = "neutral" }) => {
  const variants = {
    neutral: "bg-slate-800 text-slate-400 border-slate-700",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    danger: "bg-red-500/10 text-red-400 border-red-500/25",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${variants[variant]}`}
    >
      {children}
    </span>
  );
};

const StatCard = ({ label, value, valueClass = "text-white", sub, accent }) => (
  <div
    className={`relative rounded-xl p-3.5 bg-[#0d0d10] border ${accent ? "border-" + accent + "-500/20" : "border-slate-800/60"} overflow-hidden group transition-all hover:border-slate-700`}
  >
    {accent && (
      <div
        className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-${accent}-500/40 to-transparent`}
      />
    )}
    <div className="text-[9px] text-slate-500 uppercase tracking-[0.12em] mb-1.5 font-semibold">
      {label}
    </div>
    <div className={`font-black text-lg font-mono leading-none ${valueClass}`}>
      {value}
    </div>
    {sub && (
      <div className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">
        {sub}
      </div>
    )}
  </div>
);

const SectionHeader = ({
  icon: Icon,
  title,
  iconColor = "text-slate-400",
  right,
}) => (
  <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-800/60">
    <Icon size={12} className={iconColor} />
    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
      {title}
    </span>
    {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
  </div>
);

const PnlSourcePill = ({ source }) => {
  if (!source) return null;
  return source === "kite" ? (
    <Tag variant="success">✓ Kite</Tag>
  ) : (
    <Tag variant="warning">~ Est.</Tag>
  );
};

/* ── Feed status indicator ────────────────────────────────────────────────── */
const FeedDot = ({ status }) => {
  const cfg = {
    ok: { dot: "bg-emerald-500", text: "text-emerald-500", label: "Live" },
    error: { dot: "bg-red-500", text: "text-red-500", label: "Down" },
    connecting: { dot: "bg-amber-500", text: "text-amber-500", label: "Wait" },
  }[status] || { dot: "bg-amber-500", text: "text-amber-500", label: "Wait" }; 
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.dot}`} />
      <span
        className={`text-[9px] font-black uppercase tracking-widest ${cfg.text}`}
      >
        {cfg.label}
      </span>
    </div>
  );
};

/* ── Engine Controls Component ───────────────────────────────────────────── */
const EngineControls = ({ engine, status, action, onControl }) => {
  const isOnline  = status?.pm2 === "online";
  const isBusy    = action !== null;
  const noCtrl    = !status; // control server not reachable

  if (noCtrl) {
    // Control server down — show plain stop button (legacy fallback)
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {/* Status dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
      <span className={`text-[8px] font-black uppercase tracking-widest mr-1 ${isOnline ? "text-emerald-600" : "text-red-600"}`}>
        {isOnline ? "Online" : "Offline"}
      </span>

      {isOnline ? (
        <>
          <button
            onClick={() => onControl(engine, "restart")}
            disabled={isBusy}
            title="Restart engine"
            className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20 ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {action === "restart" ? "…" : "↺"}
          </button>
          <button
            onClick={() => onControl(engine, "stop")}
            disabled={isBusy}
            title="Stop engine"
            className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20 ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {action === "stop" ? "…" : "■"}
          </button>
        </>
      ) : (
        <button
          onClick={() => onControl(engine, "start")}
          disabled={isBusy}
          title="Start engine"
          className={`px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 ${isBusy ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {action === "start" ? "…" : "▶ Start"}
        </button>
      )}
    </div>
  );
};

/* ── Main Dashboard ───────────────────────────────────────────────────────── */
const Dashboard = () => {
  const [showOptionChain, setShowOptionChain] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // New state for history tab
  const [condorData, setCondorData] = useState([]);
  const [trafficData, setTrafficData] = useState({
    signal: "WAITING",
    livePnL: "0.00",
    direction: null,
    entryPrice: 0,
    stopLoss: "0.00",
    trailingActive: false,
    breakoutHigh: 0,
    breakoutLow: 0,
    exitReason: null,
  });
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("ALL");
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Single, unified connection state
  const [connected, setConnected] = useState(socket.connected);
  const [feedStatus, setFeedStatus] = useState("connecting"); // kite specific
  const [feedError, setFeedError] = useState(null);
  
  const [autoMode, setAutoMode] = useState(false);
  const [autoStatus, setAutoStatus] = useState(null);
  const [autoToggling, setAutoToggling] = useState(false);
  const autoArmedRef = useRef(false);
  const logsEndRef = useRef(null);
  const [engineStatus, setEngineStatus] = useState({ ic: null, tl: null }); // from control server
  const [engineAction, setEngineAction] = useState({ ic: null, tl: null }); // "starting"|"stopping"|"restarting"|null

  /* ── Data polling ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [tRes, cRes, hRes, aRes, ctrlRes] = await Promise.all([
          fetch(`${TL_URL}/api/traffic/status`),
          fetch(`${IC_URL}/api/condor/positions`),
          fetch(`${TL_URL}/api/history`),
          fetch(`${IC_URL}/api/auto-condor/status`),
          fetch(`${CTRL_URL}/control/status`).catch(() => null),
        ]);
        if (tRes.ok) setTrafficData(await tRes.json());
        if (cRes.ok) {
          const raw = await cRes.json();
          const cData = raw ? [raw] : [];
          setCondorData(cData);
          const marketHours = (() => {
            const now = new Date(
              new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
            );
            const mins = now.getHours() * 60 + now.getMinutes();
            return (
              now.getDay() >= 1 &&
              now.getDay() <= 5 &&
              mins >= 555 &&
              mins < 930
            );
          })();
          if (
            marketHours &&
            cData.length > 0 &&
            cData[0].status !== "COMPLETED"
          ) {
            const allZero = ["call", "put"].every(
              (s) => parseFloat(cData[0]?.[s]?.current) === 0,
            );
            setFeedStatus(allZero ? "error" : "ok");
            setFeedError(
              allZero
                ? "Live prices unavailable — Kite WebSocket feed down"
                : null,
            );
          } else {
            setFeedStatus("ok");
            setFeedError(null);
          }
        }
        if (hRes.ok) setHistory(await hRes.json());
        if (aRes.ok) {
          const d = await aRes.json();
          if (!autoArmedRef.current) {
            setAutoMode(d.armed === true);
          }
          setAutoStatus(d);
        }
        if (ctrlRes?.ok) {
          const ctrlData = await ctrlRes.json();
          if (ctrlData.ok) setEngineStatus(ctrlData.engines);
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
    setConnected(socket.connected);

    // Main App Connection state driven by primary server
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    
    socket.on("upstox_status", ({ status, message }) => {
      setFeedStatus(status);
      setFeedError(status === "error" ? message : null);
    });
    socket.on("auto_condor_tick", (d) => setAutoStatus(d));
    socket.on("market_tick", (data) => {
      setTrafficData((prev) => {
        if (
          prev.signal !== "ACTIVE" ||
          !prev.direction ||
          !prev.entryPrice ||
          prev._optionLtpReceived
        )
          return prev;
        const pts =
          prev.direction === "CE"
            ? data.price - prev.entryPrice
            : prev.entryPrice - data.price;
        return { ...prev, livePnL: (pts * 65).toFixed(2), pnlSource: "spot" };
      });
    });
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
    socket.on("trade_log", (entry) =>
      setLogs((prev) => [...prev, entry].slice(-200)),
    );

    // Traffic Light specific log streams
    tlSocket.on("trade_log", (entry) =>
      setLogs((prev) => [...prev, entry].slice(-200)),
    );
    tlSocket.on("market_tick", (data) => {
      setTrafficData((prev) => {
        if (prev.signal !== "ACTIVE" || !prev.direction || !prev.entryPrice || prev._optionLtpReceived) return prev;
        const pts = prev.direction === "CE" ? data.price - prev.entryPrice : prev.entryPrice - data.price;
        return { ...prev, livePnL: (pts * 65).toFixed(2), pnlSource: "spot" };
      });
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("upstox_status");
      socket.off("auto_condor_tick");
      socket.off("market_tick");
      socket.off("option_tick");
      socket.off("trade_log");
      
      tlSocket.off("trade_log");
      tlSocket.off("market_tick");
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  /* ── Fullscreen Views ───────────────────────────────────────────────────── */
  if (showOptionChain)
    return <OptionChain onClose={() => setShowOptionChain(false)} />;

  if (showHistory) {
    return (
      <div className="min-h-screen bg-[#07070a] text-slate-100 flex flex-col" style={{ fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}>
        {/* History Header */}
        <header className="relative z-10 flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-[#08080c]/80 backdrop-blur-sm">
          <button
            onClick={() => setShowHistory(false)}
            className="flex items-center gap-2 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/60 text-slate-400 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all cursor-pointer"
          >
            <ArrowLeft size={12} /> Back
          </button>
          
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-300 flex items-center gap-2">
            <TrendingUp size={14} className="text-blue-400" /> Trade History
          </h2>
          
          <div className="w-[88px]"></div> {/* Spacer for centering title */}
        </header>

        {/* History Content */}
        <div className="flex-1 p-3 sm:p-5 max-w-screen-xl mx-auto w-full">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20">
              <TrendingUp size={24} className="text-slate-800" />
              <span className="text-slate-600 text-[10px] uppercase tracking-[0.15em] font-black">
                No History Found
              </span>
            </div>
          ) : (
            <div className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden shadow-xl">
              <SectionHeader
                icon={TrendingUp}
                title="All Trades"
                iconColor="text-blue-400/70"
                right={
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-slate-700 uppercase tracking-wider hidden sm:inline">
                      PnL:
                    </span>
                    <Tag variant="success">✓ Actual</Tag>
                    <Tag variant="warning">~ Est.</Tag>
                  </div>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className="text-[8px] uppercase tracking-widest text-slate-700 border-b border-slate-800/60">
                      <th className="py-3 px-5">Date / Time</th>
                      <th className="py-3 px-2">Strategy</th>
                      <th className="py-3 px-2">Symbol</th>
                      <th className="py-3 px-2">Exit Reason</th>
                      <th className="py-3 px-2 text-center">Source</th>
                      <th className="py-3 pr-5 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => {
                      const srcMatch = h.notes?.match(
                        /PnL Source:\s*(FYERS_ACTUAL|ESTIMATED_SPOT)/,
                      );
                      const pnlSrc = srcMatch?.[1] || null;
                      const hPnl = parseFloat(h.pnl);
                      const dateObj = h.timestamp ? new Date(h.timestamp) : null;
                      
                      return (
                        <tr
                          key={i}
                          className="border-b border-slate-800/30 hover:bg-slate-900/20 transition-colors group"
                        >
                          <td className="py-3 px-5 text-[9px] text-slate-500 font-mono">
                            {dateObj ? dateObj.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                          <td className="px-2">
                            <Tag
                              variant={
                                h.strategy === "IRON_CONDOR" ? "warning" : "success"
                              }
                            >
                              {h.strategy === "IRON_CONDOR" ? "IC" : "TL"}
                            </Tag>
                          </td>
                          <td className="px-2 font-mono text-[10px] text-slate-400 group-hover:text-slate-300 transition-colors">
                            {h.symbol}
                          </td>
                          <td className="px-2 text-[10px] text-slate-600">
                            {h.exitReason?.replace(/_/g, " ")}
                          </td>
                          <td className="px-2 text-center">
                            <PnlSourcePill source={pnlSrc} />
                          </td>
                          <td
                            className={`pr-5 text-right font-black text-sm font-mono ${hPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {hPnl >= 0 ? "+" : ""}₹{hPnl.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Calculations ───────────────────────────────────────────────────────── */
  const pnl = parseFloat(trafficData.livePnL);
  const filteredLogs =
    logFilter === "ALL" ? logs : logs.filter((l) => l.strategy === logFilter);

  const classifyLog = (msg = "") => {
    if (msg.includes("fully filled")) return "fill";
    if (msg.includes("FYERS_ACTUAL")) return "actual";
    if (msg.includes("ESTIMATED_SPOT")) return "estimate";
    if (msg.includes("fill not confirmed")) return "warn";
    if (
      msg.includes("Unhandled Rejection") ||
      msg.includes("Uncaught Exception")
    )
      return "crash";
    return null;
  };

  const toggleAutoMode = async () => {
    setAutoToggling(true);
    try {
      if (autoMode) {
        // Turn OFF — reset auto condor + switch active trade back to SEMI_AUTO
        const [r1, r2] = await Promise.all([
          fetch(`${IC_URL}/api/auto-condor/reset`, { method: "POST" }),
          fetch(`${IC_URL}/api/trades/mode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "SEMI_AUTO" }),
          }),
        ]);
        if (r1.ok) {
          autoArmedRef.current = false;
          setAutoMode(false);
          setLogs((prev) => prev.filter((l) => l.strategy !== "CONDOR"));
        }
      } else {
        // Turn ON — arm auto condor + switch active trade to FULL_AUTO
        const [r1, r2] = await Promise.all([
          fetch(`${IC_URL}/api/auto-condor/trigger`, { method: "POST" }),
          fetch(`${IC_URL}/api/trades/mode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "FULL_AUTO" }),
          }),
        ]);
        if (r1.ok) {
          autoArmedRef.current = true;
          setAutoMode(true);
        }
      }
    } catch {
    } finally {
      setAutoToggling(false);
    }
  };

  const engineControl = async (engine, action) => {
    const label = engine === "ic" ? "Iron Condor" : "Traffic Light";
    const broker = engine === "ic" ? "Kite" : "Fyers";

    setEngineAction((prev) => ({ ...prev, [engine]: action }));
    try {
      const res  = await fetch(`${CTRL_URL}/control/${engine}/${action}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(`❌ ${action} failed: ${data.error || "Unknown error"}`);
    } catch (err) {
      alert(`❌ ${action} failed: ${err.message}`);
    } finally {
      // Refresh status after 2s to reflect new state
      setTimeout(async () => {
        try {
          const r = await fetch(`${CTRL_URL}/control/status`);
          const d = await r.json();
          if (d.ok) setEngineStatus(d.engines);
        } catch {}
        setEngineAction((prev) => ({ ...prev, [engine]: null }));
      }, 2000);
    }
  };

  /* ── Status Signals for UI Matching ─────────────────────────────────────── */
  const icSignal = condorData.length === 0 ? "WAITING" : condorData[0].status === "COMPLETED" ? "CLOSED" : "ACTIVE";
  
  const row = condorData[0];
  const condorPnlVal = row ? parseFloat(row.pnl) : 0;
  const condorPnlPos = condorPnlVal >= 0;

  return (
    <div
      className="min-h-screen bg-[#07070a] text-slate-100"
      style={{ fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}
    >
      {/* ── Scanline overlay ── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.8) 2px, rgba(255,255,255,0.8) 3px)",
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 border-b border-slate-800/80 bg-[#08080c]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img src={logo} alt="Logo" className="w-8 h-8 rounded-lg" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.2em] leading-none">
              Maria<span className="text-emerald-500">Algo</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-[8px] font-bold uppercase tracking-widest ${connected ? "text-emerald-600" : "text-amber-500"}`}
              >
                {connected ? "● Connected" : "○ Connecting…"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="hidden sm:block text-[9px] text-slate-600 font-mono">
              {lastUpdate.toLocaleTimeString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}
            </span>
          )}
          
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 bg-blue-600/8 cursor-pointer hover:bg-blue-600/15 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
          >
            <TrendingUp size={12} />
            <span className="hidden sm:inline">History</span>
          </button>

          <button
            onClick={() => setShowOptionChain(true)}
            className="flex items-center gap-2 bg-blue-600/8 cursor-pointer hover:bg-blue-600/15 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.12em] transition-all"
          >
            <Layers size={12} />
            <span className="hidden sm:inline">Chain</span>
          </button>
        </div>
      </header>

      <div className="relative z-10 p-3 sm:p-5 space-y-4 max-w-screen-xl mx-auto">
        {/* ── Feed alert ─────────────────────────────────────────────────── */}
        {feedStatus === "error" && (
          <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/25 rounded-xl px-4 py-3">
            <AlertTriangle size={13} className="text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-red-400 text-[10px] font-black uppercase tracking-widest">
                Kite Feed Down
              </span>
              <p className="text-red-500/60 text-[9px] mt-0.5">
                {feedError ||
                  "Iron Condor live prices unavailable — reconnecting…"}
              </p>
            </div>
            <span className="text-[8px] text-red-600/50 font-mono shrink-0">
              auto-reconnect
            </span>
          </div>
        )}
        {feedStatus === "connecting" && connected && (
          <div className="flex items-center gap-3 bg-amber-500/6 border border-amber-500/15 rounded-xl px-4 py-3">
            <Clock size={12} className="text-amber-500 shrink-0" />
            <span className="text-amber-500/80 text-[10px] font-bold">
              Connecting to Kite feed…
            </span>
          </div>
        )}

        {/* ── Iron Condor Panel ──────────────────────────────────────────── */}
        <div className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden shadow-2xl">
          <SectionHeader
            icon={Shield}
            title="Iron Condor"
            iconColor="text-amber-500/80"
            right={
              <div className="flex items-center gap-2">
                <Tag
                  variant={
                    icSignal === "ACTIVE"
                      ? "success"
                      : icSignal === "CLOSED"
                        ? "neutral"
                        : "warning"
                  }
                >
                  {icSignal}
                </Tag>
                <button
                  onClick={toggleAutoMode}
                  disabled={autoToggling}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                    autoMode
                      ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/18"
                      : "bg-slate-800/60 border-slate-700/60 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  } ${autoToggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Zap
                    size={10}
                    className={autoMode ? "text-emerald-400" : "text-slate-600"}
                  />
                  <span className="hidden sm:inline">
                    {autoToggling
                      ? "…"
                      : autoMode
                        ? autoStatus?.entryDone
                          ? "Auto ACTIVE"
                          : "Auto ARMED"
                        : "Auto OFF"}
                  </span>
                  <span className="sm:hidden">
                    {autoMode ? "AUTO" : "OFF"}
                  </span>
                  {autoMode && autoStatus?.gapOpenHold && (
                    <span className="ml-1 text-amber-400/80">Hold</span>
                  )}
                </button>
                <FeedDot status={connected ? (feedStatus === "error" ? "error" : "ok") : "connecting"} />
                <EngineControls engine="ic" status={engineStatus.ic} action={engineAction.ic} onControl={engineControl} />
              </div>
            }
          />

          {condorData.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <Shield size={18} className="text-slate-700" />
              <span className="text-slate-600 text-[10px] uppercase tracking-[0.15em] font-black">
                Scanning for Setup
              </span>
              <span className="text-slate-700 text-[9px]">
                No active position — strategy idle
              </span>
            </div>
          ) : condorData[0].status === "COMPLETED" ? (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <Tag variant="neutral">Completed</Tag>
                <span className="text-slate-400 text-xs font-mono">
                  {condorData[0].index}
                </span>
                <span className="text-slate-500 text-xs hidden sm:inline">
                  {condorData[0].exitReason?.replace(/_/g, " ")}
                </span>
              </div>
              <span
                className={`font-black text-lg font-mono ${condorPnlPos ? "text-emerald-400" : "text-red-400"}`}
              >
                ₹{condorData[0].pnl}
              </span>
            </div>
          ) : (
            <div className="p-4">
              {condorData.map((row, i) => {
                const rowPnl = parseFloat(row.pnl);
                const pnlPos = rowPnl >= 0;
                const callLive = parseFloat(row.call.current);
                const putLive = parseFloat(row.put.current);
                const callEntry = parseFloat(row.call.entry);
                const putEntry = parseFloat(row.put.entry);
                const callPct =
                  callEntry > 0 && callLive > 0 ? (callLive / callEntry) * 100 : 100;
                const putPct = putEntry > 0 && putLive > 0 ? (putLive / putEntry) * 100 : 100;

                return (
                  <div key={i} className="space-y-3">
                    {/* Summary bar */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between bg-[#0d0d10] rounded-xl px-4 py-3 border border-slate-800/50 gap-4">
                      <div className="flex items-center gap-4 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                        <div className="text-center shrink-0">
                          <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                            Index
                          </div>
                          <div className="text-sm font-black text-slate-300 font-mono">
                            {row.index}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-slate-800 shrink-0" />
                        <div className="text-center shrink-0">
                          <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                            Qty
                          </div>
                          <div className="text-sm font-black text-slate-300 font-mono">
                            {row.quantity ?? "—"}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-slate-800 shrink-0" />
                        <div className="text-center shrink-0">
                          <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                            Booked
                          </div>
                          <div className="text-sm font-black text-emerald-500 font-mono">
                            ₹{row.buffer}
                          </div>
                        </div>
                        {row.slCount > 0 && (
                          <>
                            <div className="w-px h-8 bg-slate-800 shrink-0" />
                            <div className="text-center shrink-0">
                              <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                                SL Hits
                              </div>
                              <div className="text-sm font-black text-amber-400 font-mono">
                                {row.slCount}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="text-left sm:text-right w-full sm:w-auto border-t border-slate-800/50 sm:border-t-0 pt-2 sm:pt-0">
                        <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-0.5">
                          Live P&L
                        </div>
                        <div
                          className={`text-2xl font-black font-mono ${feedStatus === "error" ? "text-slate-700" : pnlPos ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {feedStatus === "error" ? "—" : `₹${row.pnl}`}
                        </div>
                      </div>
                    </div>

                    {/* Legs grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* CALL leg */}
                      <div className="bg-[#0d0d10] border border-red-900/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={11} className="text-red-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-red-400">
                              Call Spread
                            </span>
                          </div>
                          <Tag variant="danger">SHORT</Tag>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">
                              Entry
                            </div>
                            <div className="font-mono text-xs font-bold text-slate-300">
                              ₹{row.call.entry}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">
                              Live
                            </div>
                            <div
                              className={`font-mono text-xs font-bold ${feedStatus === "error" ? "text-slate-700" : ""}`}
                            >
                              {feedStatus === "error" || !parseFloat(row.call.current)
                                ? "—"
                                : `₹${row.call.current}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">
                              SL
                            </div>
                            <div className="font-mono text-xs font-bold text-red-400">
                              ₹{row.call.sl}
                            </div>
                          </div>
                        </div>
                        {/* Decay progress bar */}
                        <div>
                          <div className="flex justify-between text-[8px] text-slate-600 mb-1">
                            <span>Decay</span>
                            <span className="text-emerald-600">
                              FF ₹{row.call.ff3x}
                            </span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.min(100, Math.max(0, 100 - callPct))}%`,
                                background:
                                  callPct < 40
                                    ? "#34d399"
                                    : callPct < 70
                                      ? "#fbbf24"
                                      : "#f87171",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* PUT leg */}
                      <div className="bg-[#0d0d10] border border-emerald-900/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingDown
                              size={11}
                              className="text-emerald-400"
                            />
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                              Put Spread
                            </span>
                          </div>
                          <Tag variant="success">SHORT</Tag>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">
                              Entry
                            </div>
                            <div className="font-mono text-xs font-bold text-slate-300">
                              ₹{row.put.entry}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">
                              Live
                            </div>
                            <div
                              className={`font-mono text-xs font-bold ${feedStatus === "error" ? "text-slate-700" : ""}`}
                            >
                              {feedStatus === "error" || !parseFloat(row.put.current)
                                ? "—"
                                : `₹${row.put.current}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-1">
                              SL
                            </div>
                            <div className="font-mono text-xs font-bold text-red-400">
                              ₹{row.put.sl}
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[8px] text-slate-600 mb-1">
                            <span>Decay</span>
                            <span className="text-emerald-600">
                              FF ₹{row.put.ff3x}
                            </span>
                          </div>
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.min(100, Math.max(0, 100 - putPct))}%`,
                                background:
                                  putPct < 40
                                    ? "#34d399"
                                    : putPct < 70
                                      ? "#fbbf24"
                                      : "#f87171",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Firefight pending banner */}
                    {row.firefightPending && (
                      <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2">
                        <Zap size={11} className="text-amber-400" />
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">
                          Firefight Pending — {row.firefightSide?.toUpperCase()}{" "}
                          side
                        </span>
                        <button
                          onClick={async () => {

                            const res = await fetch(
                              `${IC_URL}/api/trades/firefight`,
                              { method: "POST" },
                            );
                            if (!res.ok)
                              alert(
                                "Firefight failed: " +
                                  (await res.json().catch(() => ({}))).error,
                              );
                          }}
                          className="ml-auto px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-widest rounded-md transition-all"
                        >
                          Execute ⚡
                        </button>
                      </div>
                    )}
                    {/* Opposite side pending banner (one-side → iron condor) */}
                    {row.oppositeSidePending && (
                      <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/25 rounded-lg px-3 py-2">
                        <Zap size={11} className="text-blue-400" />
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">
                          3x Loss · Enter {row.oppositeSide?.toUpperCase()} side → Iron Condor
                        </span>
                        <button
                          onClick={async () => {
                            const res = await fetch(`${IC_URL}/api/trades/enter-opposite`, { method: "POST" });
                            if (!res.ok) alert("Failed: " + (await res.json().catch(() => ({}))).error);
                          }}
                          className="ml-auto px-3 py-1 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 text-[9px] font-black uppercase tracking-widest rounded-md transition-all"
                        >
                          Enter ▶
                        </button>
                      </div>
                    )}

                    {/* Butterfly pending banner */}
                    {row.butterflyPending && !row.isButterfly && (
                      <div className="flex items-center gap-2 bg-purple-500/8 border border-purple-500/25 rounded-lg px-3 py-2">
                        <Activity size={11} className="text-purple-400" />
                        <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">
                          Butterfly Conversion Pending — Sell leg at ATM + SL
                          hit
                        </span>
                        <button
                          onClick={async () => {

                            const res = await fetch(
                              `${IC_URL}/api/trades/butterfly`,
                              { method: "POST" },
                            );
                            if (!res.ok)
                              alert(
                                "Butterfly failed: " +
                                  (await res.json().catch(() => ({}))).error,
                              );
                          }}
                          className="ml-auto px-3 py-1 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 text-[9px] font-black uppercase tracking-widest rounded-md transition-all"
                        >
                          Convert 🦋
                        </button>
                      </div>
                    )}
                    {/* Butterfly active badge */}
                    {row.isButterfly && (
                      <div className="flex items-center gap-2 bg-purple-500/8 border border-purple-500/20 rounded-lg px-3 py-2">
                        <Activity size={11} className="text-purple-400" />
                        <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">
                          Iron Butterfly
                        </span>
                        <span className="text-[9px] text-slate-500 ml-auto">
                          SL ₹{row.butterflySL}
                        </span>
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
                <div className="flex items-center gap-2">
                  <Tag
                    variant={
                      trafficData.signal === "ACTIVE"
                        ? "success"
                        : trafficData.signal === "CLOSED"
                          ? "neutral"
                          : "warning"
                    }
                  >
                    {trafficData.signal}
                  </Tag>
                  <FeedDot status={connected ? "ok" : "connecting"} />
                  <EngineControls engine="tl" status={engineStatus.tl} action={engineAction.tl} onControl={engineControl} />
                </div>
              }
            />

            <div className="p-4">
              {trafficData.signal === "ACTIVE" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <StatCard
                    label="Direction"
                    accent={trafficData.direction === "CE" ? "emerald" : "red"}
                    value={
                      <span className="flex items-center gap-1.5">
                        {trafficData.direction === "CE" ? (
                          <TrendingUp size={14} className="text-emerald-400" />
                        ) : (
                          <TrendingDown size={14} className="text-red-400" />
                        )}
                        {trafficData.direction}
                      </span>
                    }
                    valueClass={
                      trafficData.direction === "CE"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  />
                  <StatCard
                    label="Entry Spot"
                    value={trafficData.entryPrice}
                    valueClass="text-slate-200"
                  />
                  <StatCard
                    label="Live P&L"
                    accent={pnl >= 0 ? "emerald" : "red"}
                    value={`₹${trafficData.livePnL}`}
                    valueClass={pnl >= 0 ? "text-emerald-400" : "text-red-400"}
                    sub={
                      trafficData.pnlSource === "option"
                        ? `option LTP ₹${trafficData.optionLtp ?? "—"} · actual`
                        : "spot estimate · awaiting option tick"
                    }
                  />
                  <StatCard
                    label={
                      trafficData.trailingActive ? "Trail SL 🔒" : "Stop Loss"
                    }
                    accent={trafficData.trailingActive ? "emerald" : "red"}
                    value={trafficData.stopLoss}
                    valueClass={
                      trafficData.trailingActive
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  />
                  {trafficData.breakoutHigh > 0 && (
                    <>
                      <StatCard
                        label="Range High"
                        value={trafficData.breakoutHigh}
                        valueClass="text-slate-300"
                      />
                      <StatCard
                        label="Range Low"
                        value={trafficData.breakoutLow}
                        valueClass="text-slate-300"
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-6">
                  <div
                    className={`text-6xl font-black tracking-tighter ${
                      trafficData.signal === "CLOSED"
                        ? "text-slate-700"
                        : "text-amber-500/30"
                    }`}
                  >
                    {trafficData.signal}
                  </div>
                  {trafficData.breakoutHigh > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
                      <StatCard
                        label="Range High"
                        value={trafficData.breakoutHigh}
                        valueClass="text-slate-300"
                      />
                      <StatCard
                        label="Range Low"
                        value={trafficData.breakoutLow}
                        valueClass="text-slate-300"
                      />
                    </div>
                  )}
                  <p className="text-slate-600 text-[10px] text-center">
                    {trafficData.signal === "CLOSED" ? (
                      <>
                        Trade completed
                        {trafficData.exitReason && (
                          <span className="ml-2">
                            <Tag variant="neutral">
                              {trafficData.exitReason.replace(/_/g, " ")}
                            </Tag>
                          </span>
                        )}
                      </>
                    ) : (
                      "Waiting for range lock…"
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Live Logs */}
          <div
            className="bg-[#09090d] border border-slate-800/70 rounded-2xl overflow-hidden flex flex-col shadow-xl"
            style={{ height: 360 }}
          >
            <SectionHeader
              icon={BarChart2}
              title="Live Logs"
              iconColor={connected ? "text-emerald-500" : "text-amber-500"}
              right={
                <div className="flex items-center gap-1">
                  {["ALL", "TRAFFIC", "CONDOR"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setLogFilter(f)}
                      className={`px-2.5 py-1 cursor-pointer rounded-md text-[8px] font-black transition-all uppercase tracking-widest ${
                        logFilter === f
                          ? f === "TRAFFIC"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : f === "CONDOR"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-slate-700 text-white"
                          : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                  {logs.length > 0 && (
                    <button
                      onClick={() => setLogs([])}
                      className="px-2 py-1 rounded cursor-pointer text-[8px] text-slate-600 hover:text-red-400 ml-1 transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
              }
            />

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 font-mono text-[9.5px]">
              {filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-700 text-xs">
                  No logs yet…
                </div>
              ) : (
                filteredLogs.map((log, i) => {
                  const badge = STRATEGY_BADGE[log.strategy];
                  const kind = classifyLog(log.msg);
                  const rowCls =
                    kind === "fill"
                      ? "bg-emerald-500/5 rounded px-1.5 border-l border-emerald-500/30"
                      : kind === "actual"
                        ? "bg-emerald-500/4 rounded px-1.5"
                        : kind === "estimate"
                          ? "bg-amber-500/4 rounded px-1.5"
                          : kind === "crash"
                            ? "bg-red-500/8 rounded px-1.5 border-l border-red-500/40"
                            : "";
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 leading-relaxed ${rowCls}`}
                    >
                      <span className="text-slate-700 shrink-0">
                        {log.time}
                      </span>
                      {badge && (
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded text-[7px] font-black ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      )}
                      {kind === "fill" && (
                        <CheckCircle
                          size={9}
                          className="text-emerald-500 shrink-0 mt-0.5"
                        />
                      )}
                      {kind === "crash" && (
                        <AlertCircle
                          size={9}
                          className="text-red-400 shrink-0 mt-0.5"
                        />
                      )}
                      <span
                        className={LOG_STYLE[log.level] || "text-slate-500"}
                      >
                        {log.msg}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;