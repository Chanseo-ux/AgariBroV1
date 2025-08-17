import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, RotateCcw, Volume2, VolumeX, X, Palette } from "lucide-react";

/* ---------- LocalStorage keys ---------- */
const LS = {
  design: "timer.style.preset",
  waveMood: "timer.wave.mood",
  sandSimplified: "timer.sandglass.simplified",
  barCentered: "timer.bar.centeredLabel",
  muted: "timer.sound.enabled",
  targetMs: "timer.targetMs",
  running: "timer.running",
  endTs: "timer.endTs",
};

/* ---------- helpers ---------- */
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const LIMIT_SEC = 23 * 3600 + 59 * 60 + 59; // 23:59:59

const bufToSec = (b) => {
  const h = parseInt(b.slice(0, 2), 10) || 0;
  const m = parseInt(b.slice(2, 4), 10) || 0;
  const s = parseInt(b.slice(4, 6), 10) || 0;
  return clamp(h * 3600 + m * 60 + s, 0, LIMIT_SEC);
};
const secToBuf = (sec) => {
  const t = clamp(sec | 0, 0, LIMIT_SEC);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${pad2(h)}${pad2(m)}${pad2(s)}`;
};
const msToBuf = (ms) => secToBuf(Math.floor(ms / 1000));
const bufToMs = (b) => bufToSec(b) * 1000;

export default function TimerCard() {
  /* ---------- prefs ---------- */
  const [design, setDesign] = useState(localStorage.getItem(LS.design) || "wave");
  const [waveMood, setWaveMood] = useState(localStorage.getItem(LS.waveMood) || "calm");
  const [sandSimplified, setSandSimplified] = useState(localStorage.getItem(LS.sandSimplified) !== "false");
  const [barCentered, setBarCentered] = useState(localStorage.getItem(LS.barCentered) !== "false");
  const [muted, setMuted] = useState(localStorage.getItem(LS.muted) === "true");

  /* ---------- timer state ---------- */
  const [editing, setEditing] = useState(true);
  const [buf, setBuf] = useState(() => {
    const saved = Number(localStorage.getItem(LS.targetMs) || 0);
    return saved > 0 ? msToBuf(saved) : "000000";
  });

  const [targetMs, setTargetMs] = useState(() => Number(localStorage.getItem(LS.targetMs) || 0));
  const [running, setRunning] = useState(localStorage.getItem(LS.running) === "true");
  const [endTs, setEndTs] = useState(() => Number(localStorage.getItem(LS.endTs) || 0));
  const [now, setNow] = useState(Date.now());
  const [lastStartMs, setLastStartMs] = useState(targetMs || 0);

  /* ---------- end-alarm (5s) ---------- */
  const [ended, setEnded] = useState(false);
  const alarmRef = useRef({ ctx: null, nodes: [], stopTimer: null });

  /* ---------- smooth tick (RAF) ---------- */
  const rafRef = useRef(null);
  useEffect(() => {
    if (!running) return;
    const loop = () => { setNow(Date.now()); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const remainingMs = useMemo(
    () => (running ? Math.max(0, endTs - now) : targetMs),
    [running, endTs, now, targetMs]
  );

  const frac = useMemo(() => {
    if ((editing && !running) || targetMs === 0) return 0;
    return clamp(remainingMs / targetMs, 0, 1);
  }, [editing, running, targetMs, remainingMs]);

  /* ---------- persist ---------- */
  useEffect(() => localStorage.setItem(LS.design, design), [design]);
  useEffect(() => localStorage.setItem(LS.waveMood, waveMood), [waveMood]);
  useEffect(() => localStorage.setItem(LS.sandSimplified, String(sandSimplified)), [sandSimplified]);
  useEffect(() => localStorage.setItem(LS.barCentered, String(barCentered)), [barCentered]);
  useEffect(() => localStorage.setItem(LS.muted, String(muted)), [muted]);
  useEffect(() => localStorage.setItem(LS.targetMs, String(targetMs)), [targetMs]);
  useEffect(() => localStorage.setItem(LS.running, String(running)), [running]);
  useEffect(() => localStorage.setItem(LS.endTs, String(endTs)), [endTs]);

  /* ---------- alarm helpers ---------- */
  const stopAlarm = () => {
    setEnded(false);
    const a = alarmRef.current;
    if (a.stopTimer) { clearTimeout(a.stopTimer); a.stopTimer = null; }
    a.nodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    a.nodes = [];
  };

  const startAlarm = () => {
    setEnded(true);
    if (!muted) {
      let ctx = alarmRef.current.ctx;
      if (!ctx) ctx = alarmRef.current.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ctx.currentTime;
      const ping = (t) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(880, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.52);
        alarmRef.current.nodes.push(osc, g);
      };
      ping(t0 + 0.00);
      ping(t0 + 1.8);
      ping(t0 + 3.6);
    }
    alarmRef.current.stopTimer = setTimeout(() => {
      stopAlarm();
      setTargetMs(lastStartMs);
      setEditing(false);
    }, 5000);
  };

  /* ---------- end detection ---------- */
  const chimePlayedRef = useRef(false);
  useEffect(() => {
    if (!running) { chimePlayedRef.current = false; return; }
    if (remainingMs <= 0 && !chimePlayedRef.current) {
      chimePlayedRef.current = true;
      setRunning(false);
      setEndTs(0);
      startAlarm();
    }
  }, [remainingMs, running]); // mute/lastStart handled in helpers

  /* ---------- actions ---------- */
  const startFromCurrent = () => {
    const ms = editing ? bufToMs(buf) : targetMs;
    if (ms <= 0) return;
    stopAlarm();
    setLastStartMs(ms);
    setTargetMs(ms);
    setEndTs(Date.now() + ms);
    setRunning(true);
    setEditing(false);
  };
  const onPause = () => { setRunning(false); setTargetMs(remainingMs); };
  const onReset = () => {
    setRunning(false); stopAlarm();
    setTargetMs(0); setEndTs(0); setBuf("000000"); setEditing(true);
  };
  const onStopAlarm = () => { stopAlarm(); setTargetMs(lastStartMs); setEditing(false); };

  /* ---------- caret-based editing ---------- */
  const [caret, setCaret] = useState(0);       // 0..6
  const [caretOn, setCaretOn] = useState(false);
  const showCaret = editing && !running && caretOn;

  const displayBuf = running ? msToBuf(remainingMs) : (editing ? buf : msToBuf(targetMs));
  const [H1,H2,M1,M2,S1,S2] = displayBuf.split("");

  const clampCaret = (i) => Math.max(0, Math.min(6, i));

  const setCaretFromClick = (idx, side) => {
    const pos = idx + (side === "right" ? 1 : 0);
    setCaret(clampCaret(pos)); setCaretOn(true); setEditing(true);
  };

  const insertDigit = (d) => {
    const left = buf.slice(0, caret);
    const right = buf.slice(caret);
    const next = (left + d + right).slice(0, 6).padEnd(6, "0");
    const clamped = secToBuf(bufToSec(next));
    setBuf(clamped); setCaret(clampCaret(caret + 1));
  };
  const backspace = () => {
    if (caret === 0) return;
    const left = buf.slice(0, caret - 1);
    const right = buf.slice(caret);
    const shifted = (left + right + "0").slice(0, 6);
    const clamped = secToBuf(bufToSec(shifted));
    setBuf(clamped); setCaret(clampCaret(caret - 1));
  };
  const delAt = () => {
    if (caret >= 6) return;
    const left = buf.slice(0, caret);
    const right = buf.slice(caret + 1);
    const shifted = (left + right + "0").slice(0, 6);
    setBuf(secToBuf(bufToSec(shifted)));
  };
  const adjustBy = (deltaSec) => setBuf(secToBuf(clamp(bufToSec(buf) + deltaSec, 0, LIMIT_SEC)));

  /* ---------- global key capture (type anywhere) ---------- */
  useEffect(() => {
    const isEditableTarget = (el) => {
      const tag = (el?.tagName || "").toLowerCase();
      return el?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    };
    const onKey = (e) => {
      // Stop alarm quickly
      if (ended && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onStopAlarm(); return; }

      // Space toggles when not editing caret
      if (!editing || !caretOn) {
        if (e.key === " ") { e.preventDefault(); running ? onPause() : startFromCurrent(); return; }
        if (e.key.toLowerCase() === "r") { e.preventDefault(); onReset(); return; }
      }

      // If running, ignore numeric capture
      if (running) return;

      // If user is typing in a real input, ignore
      if (isEditableTarget(e.target)) return;

      // Type-anywhere digits push into buffer
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const next = (buf + e.key).slice(-6); // push-right
        setBuf(secToBuf(bufToSec(next)));
        setEditing(true);
        return;
      }

      if (e.key === "Backspace") {
        e.preventDefault();
        const next = ("0" + buf).slice(0, 6); // pop-right
        setBuf(secToBuf(bufToSec(next)));
        return;
      }

      if (e.key === "Delete") { e.preventDefault(); setBuf("000000"); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buf, running, ended, editing, caretOn]);

  /* ---------- scrubbing helpers (disabled while caret active) ---------- */
  const scrubDisabled = showCaret;
  const scrubByX = (rect, clientX, snap5 = true) => {
    if (scrubDisabled) return;
    const x = clamp(clientX - rect.left, 0, rect.width);
    const f = x / rect.width;
    const total = Math.round(f * LIMIT_SEC);
    const snap = snap5 ? 5 : 1;
    const sec = Math.round(total / snap) * snap;
    setBuf(secToBuf(sec));
  };
  const scrubBar = (e) => {
    if (scrubDisabled) return;
    const el = e.currentTarget.querySelector(".agari-bar").getBoundingClientRect();
    const setX = (clientX, shift) => scrubByX(el, clientX, !shift);
    setX(e.clientX ?? e.touches?.[0]?.clientX ?? 0, e.shiftKey);
    const move = (ev) => setX(ev.clientX ?? ev.touches?.[0]?.clientX ?? 0, ev.shiftKey);
    const end = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
  };
  const ringScrub = (e, cx, cy, snap5 = true) => {
    if (scrubDisabled) return;
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - cx;
    const y = (e.clientY ?? e.touches?.[0]?.clientY) - cy;
    let ang = Math.atan2(y, x);
    ang = (ang + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    const f = ang / (2 * Math.PI);
    const total = Math.round(f * LIMIT_SEC);
    const snap = snap5 ? 5 : 1;
    const sec = Math.round(total / snap) * snap;
    setBuf(secToBuf(sec));
  };

  /* ---------- shared time box (HH:MM:SS) ---------- */
  const TimeBox = () => {
    const digits = [
      { ch: H1, idx: 0 }, { ch: H2, idx: 1 }, { colon: true },
      { ch: M1, idx: 2 }, { ch: M2, idx: 3 }, { colon: true },
      { ch: S1, idx: 4 }, { ch: S2, idx: 5 },
    ];
    const caretSlot = caret; // 0..6
    return (
      <div className="group relative select-none">
        <div
          tabIndex={0}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md text-white drop-shadow-lg font-sans tabular-nums text-6xl sm:text-7xl focus:outline-none"
          title="Click between digits to edit (HH:MM:SS). Enter = Start"
          onClick={() => { setEditing(true); setCaretOn(true); }}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setCaretOn(false); }}
        >
          <div className="flex items-center">
            {digits.map((d, k) => {
              if (d.colon) return <span key={`c${k}`} className="px-1 opacity-90">:</span>;
              return (
                <div key={`d${k}`} className="relative flex">
                  {showCaret && caretSlot === d.idx && (
                    <span className="agari-caret absolute -left-0.5 top-1/2 -translate-y-1/2 h-[1.2em]" />
                  )}
                  <span
                    className="px-0.5"
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const side = (e.clientX - rect.left) < rect.width / 2 ? "left" : "right";
                      setCaretFromClick(d.idx, side);
                    }}
                  >
                    {d.ch}
                  </span>
                  {showCaret && d.idx === 5 && caretSlot === 6 && (
                    <span className="agari-caret absolute -right-0.5 top-1/2 -translate-y-1/2 h-[1.2em]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* underline scrub (disabled while caret active) */}
        <div
          className={`mt-3 h-1 rounded-full ${scrubDisabled ? "bg-white/20" : "bg-white/30"} w-full agari-underline`}
          onMouseDown={(e) => {
            if (scrubDisabled) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const setX = (clientX, shift) => scrubByX(rect, clientX, !shift);
            setX(e.clientX ?? e.touches?.[0]?.clientX ?? 0, e.shiftKey);
            const move = (ev) => setX(ev.clientX ?? ev.touches?.[0]?.clientX ?? 0, ev.shiftKey);
            const end = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", end);
              window.removeEventListener("touchmove", move);
              window.removeEventListener("touchend", end);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", end);
            window.addEventListener("touchmove", move, { passive: false });
            window.addEventListener("touchend", end);
          }}
        >
          <div
            className="h-full rounded-full bg-white/80"
            style={{ width: `${(bufToSec(displayBuf) / LIMIT_SEC) * 100}%`, transition: "width 120ms linear" }}
          />
        </div>
      </div>
    );
  };

  /* ---------- designs ---------- */
  const Ring = () => {
    const r = 118, c = 2 * Math.PI * r, dash = c * frac;
    const svgSize = 300, view = 280, cx = 140, cy = 140;
    const angle = -Math.PI / 2 + (1 - frac) * 2 * Math.PI;
    const hx = cx + Math.cos(angle) * r, hy = cy + Math.sin(angle) * r;
    return (
      <svg
        width={svgSize} height={svgSize} viewBox={`0 0 ${view} ${view}`}
        className="drop-shadow-md touch-none"
        onMouseDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); ringScrub(e, rect.left + rect.width / 2, rect.top + rect.height / 2, !e.shiftKey); }}
        onTouchStart={(e) => { const rect = e.currentTarget.getBoundingClientRect(); ringScrub(e, rect.left + rect.width / 2, rect.top + rect.height / 2, true); }}
      >
        <circle cx={cx} cy={cy} r={r} className="fill-none stroke-white/25" strokeWidth="10" />
        <circle
          cx={cx} cy={cy} r={r}
          className="fill-none"
          stroke="white" strokeOpacity="0.9"
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.6))" }}
        />
        <circle cx={hx} cy={hy} r="4.5" fill="white" opacity="0.95" />
      </svg>
    );
  };

  const RingTicks = () => {
    const r = 125, c = 2 * Math.PI * r, dash = c * frac;
    const svgSize = 320, view = 300, cx = 150, cy = 150;
    const ticks = Array.from({ length: 60 }, (_, i) => i);
    return (
      <svg
        width={svgSize} height={svgSize} viewBox={`0 0 ${view} ${view}`}
        className="drop-shadow-md touch-none"
        onMouseDown={(e) => { const rect = e.currentTarget.getBoundingClientRect(); ringScrub(e, rect.left + rect.width / 2, rect.top + rect.height / 2, !e.shiftKey); }}
        onTouchStart={(e) => { const rect = e.currentTarget.getBoundingClientRect(); ringScrub(e, rect.left + rect.width / 2, rect.top + rect.height / 2, true); }}
      >
        {ticks.map(i => {
          const a = (i / 60) * 2 * Math.PI;
          const x1 = cx + Math.cos(a) * r;
          const y1 = cy + Math.sin(a) * r;
          const x2 = cx + Math.cos(a) * (r - (i % 5 === 0 ? 12 : 7));
          const y2 = cy + Math.sin(a) * (r - (i % 5 === 0 ? 12 : 7));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`rgba(255,255,255,${i % 5 === 0 ? 0.6 : 0.3})`} strokeWidth={i % 5 === 0 ? 2 : 1} />;
        })}
        <circle cx={cx} cy={cy} r={r - 16} className="fill-none stroke-white/20" strokeWidth="10" />
        <circle
          cx={cx} cy={cy} r={r - 16}
          className="fill-none"
          stroke="white" strokeWidth="10"
          strokeDasharray={`${dash} ${c}`} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.6))" }}
        />
      </svg>
    );
  };

  /* Bar mode — timer ABOVE bar */
  const Bar = () => (
    <div className="w-full max-w-3xl" onMouseDown={scrubBar} onTouchStart={scrubBar}>
      <div className="agari-bar h-4 w-full rounded-full bg-white/20 overflow-hidden">
        <div className="h-full rounded-full bg-white/80 transition-[width] duration-100 ease-linear" style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );

  /* Waveform — wider + shorter + clearer stripes */
  const Wave = () => {
    const speed = waveMood === "lively" ? 20 : 40;
    return (
      <div className="relative w-full max-w-6xl h-44 sm:h-48 overflow-hidden">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background: "repeating-linear-gradient(to right, rgba(255,255,255,0.32) 0 2px, transparent 2px 8px)",
            animation: `waveScroll ${speed}s linear infinite`,
            backgroundSize: "200% 100%",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/95 font-sans tabular-nums font-semibold tracking-widest text-6xl sm:text-7xl drop-shadow-lg">
            {`${H1}${H2}:${M1}${M2}:${S1}${S2}`}
          </div>
        </div>
        <div className="absolute bottom-3 left-6 right-6 h-1 bg-white/25 rounded-full overflow-hidden">
          <div className="h-full bg-white/80 transition-[width] duration-100 ease-linear" style={{ width: `${frac * 100}%` }} />
        </div>
      </div>
    );
  };

  /* Hourglass (unchanged visuals) */
  const Sandglass = () => {
    const size = 320;
    const topFrac = frac, botFrac = 1 - frac;
    const runningStream = running && frac > 0;
    const w = 100, h = 140;
    const neckY1 = 68, neckY2 = 72;
    const glassStroke = "rgba(255,255,255,0.55)";
    const outline = `
      M 20 20 C 40 20, 60 20, 80 20 C 68 36, 60 50, 52 64
      C 51 66, 49 66, 48 64 C 40 50, 32 36, 20 20
      M 20 120 C 32 104, 40 90, 48 76
      C 49 74, 51 74, 52 76 C 60 90, 68 104, 80 120
      C 60 120, 40 120, 20 120
    `;
    const pileHeight = 6 + botFrac * 10;
    const pilePath = `
      M 22 ${120 - pileHeight}
      Q 50 ${124 + pileHeight * 0.35} 78 ${120 - pileHeight}
      L 78 120 L 22 120 Z
    `;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${w} ${h}`} className="drop-shadow-md">
        <ellipse cx="50" cy="130" rx="26" ry="5" fill="rgba(0,0,0,0.08)" />
        <path d={outline} fill="none" stroke={glassStroke} strokeWidth="2" strokeLinejoin="round" />
        <path d="M26 24 C 44 24, 56 24, 74 24" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
        <path d="M26 116 C 44 116, 56 116, 74 116" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" fill="none" />
        <clipPath id="topBulb"><path d="M 20 20 C 40 20, 60 20, 80 20 C 68 36, 60 50, 52 64 C 51 66, 49 66, 48 64 C 40 50, 32 36, 20 20 Z" /></clipPath>
        <clipPath id="botBulb"><path d="M 20 120 C 32 104, 40 90, 48 76 C 49 74, 51 74, 52 76 C 60 90, 68 104, 80 120 C 60 120, 40 120, 20 120 Z" /></clipPath>
        <rect x="20" width="60" y={20 + (44 * (1 - topFrac))} height={44 * topFrac} clipPath="url(#topBulb)" fill="rgba(255,255,255,0.9)" />
        <rect x="20" width="60" y={120 - 18 * botFrac} height={18 * botFrac} clipPath="url(#botBulb)" fill="rgba(255,255,255,0.85)" />
        <path d={pilePath} clipPath="url(#botBulb)" fill="rgba(255,255,255,0.95)" />
        {runningStream && (
          <g opacity="0.95">
            <rect x="49" y={neckY1} width="2" height={neckY2 - neckY1} rx="1" fill="white">
              <animate attributeName="opacity" values="0.9;0.6;0.9" dur="0.6s" repeatCount="indefinite" />
            </rect>
            {!sandSimplified && Array.from({ length: 12 }).map((_, i) => (
              <circle key={i} cx="50" cy={neckY1 + 1} r="0.55" fill="white" opacity="0.9">
                <animate attributeName="cy" values={`${neckY1 + 1};${neckY2 - 2}`} dur={`${0.45 + (i % 6) * 0.06}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.9;0.2" dur={`${0.45 + (i % 6) * 0.06}s`} repeatCount="indefinite" />
              </circle>
            ))}
          </g>
        )}
      </svg>
    );
  };

  /* ---------- body by design ---------- */
  const BodyByDesign = () => {
    if (design === "wave") return <Wave />;
    if (design === "bar") return (
      <div className="flex flex-col items-center gap-6">
        <TimeBox /><Bar />
      </div>
    );
    const stack = (vis) => (<div className="flex flex-col items-center gap-6">{vis}<TimeBox /></div>);
    switch (design) {
      case "ring-ticks": return stack(<RingTicks />);
      case "sandglass":  return stack(<Sandglass />);
      default:           return stack(<Ring />);
    }
  };

  /* ---------- layout (pulled up so buttons are always visible) ---------- */
  const [open, setOpen] = useState(false);

  return (
    <div className="agari-gradient relative w-full min-h-screen flex items-start justify-center">
      {/* top padding reduced; bottom padding trimmed */}
      <div className="w-full flex flex-col items-center gap-6 px-4 pt-10 pb-16">
        {/* tiny subtitle */}
        <div className="self-start ml-4 text-white/85 text-sm font-medium drop-shadow">Focus Time</div>

        {/* top-right controls */}
        <div className="absolute top-3 right-3 flex items-center gap-2 text-black">
          <button onClick={() => setMuted(m => !m)} className="p-2 rounded hover:bg-black/5" title={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX className="text-black" /> : <Volume2 className="text-black" />}
          </button>
          <button onClick={() => setOpen(true)} className="p-2 rounded hover:bg-black/5" title="Change layout">
            <Palette className="text-black" />
          </button>
        </div>

        {/* center stack */}
        <BodyByDesign />

        {/* Actions row */}
        <div className="mt-2 flex w-full max-w-2xl sm:max-w-3xl gap-3 justify-center">
          {ended ? (
            <button
              onClick={onStopAlarm}
              className="flex-[1.2] inline-flex items-center justify-center gap-2 rounded-full bg-black text-white hover:bg-black/90 font-semibold py-3.5 sm:py-4 px-7"
              aria-live="assertive"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => (running ? onPause() : startFromCurrent())}
              className="flex-[1.2] inline-flex items-center justify-center gap-2 rounded-full bg-white/20 hover:bg-white/30 border border-white/30 text-black font-semibold py-3.5 sm:py-4 px-7"
            >
              {running ? (<><Pause size={18} className="text-black" /><span>Pause</span></>) :
                          (<><Play size={18} className="text-black" /><span>Start</span></>)}
            </button>
          )}

          <button
            onClick={onReset}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-black font-semibold py-3.5 sm:py-4 px-6"
          >
            <RotateCcw size={18} className="text-black" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* drawer backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
        )}
      </AnimatePresence>

      {/* drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="absolute right-0 top-0 h-full w-[min(92vw,380px)] bg-white/20 backdrop-blur-2xl border-l border-white/30 text-black p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Change Layout</h3>
              <button className="p-2 rounded hover:bg-black/5" onClick={() => setOpen(false)}><X className="text-black" /></button>
            </div>

            <div className="space-y-5">
              <div>
                <div className="text-sm mb-2 text-black/70">Timer Design</div>
                <div className="flex flex-col gap-2">
                  {[
                    { id: "ring", label: "Ring" },
                    { id: "ring-ticks", label: "Ring + Ticks" },
                    { id: "bar", label: "Bar" },
                    { id: "wave", label: "Waveform" },
                    { id: "sandglass", label: "Sandglass" },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setDesign(opt.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border ${
                        design === opt.id ? "bg-black/5 border-black/40" : "bg-white/30 hover:bg-white/40 border-black/20"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {design === "wave" && (
                <div>
                  <div className="mb-2 text-sm text-black/70">Wave mood</div>
                  <div className="flex flex-col gap-2">
                    {["calm", "lively"].map(m => (
                      <button
                        key={m}
                        onClick={() => setWaveMood(m)}
                        className={`w-full text-left px-3 py-2 rounded-lg border ${
                          waveMood === m ? "bg-black/5 border-black/40" : "bg-white/30 hover:bg-white/40 border-black/20"
                        }`}
                      >
                        {m[0].toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {design === "sandglass" && (
                <div className="space-y-2">
                  <div className="text-sm text-black/70">Simplified mode</div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-black" checked={sandSimplified} onChange={e => setSandSimplified(e.target.checked)} />
                    <span className="text-sm">Turn off falling grains (performance)</span>
                  </label>
                </div>
              )}

              {design === "bar" && (
                <div className="space-y-2">
                  <div className="text-sm text-black/70">Bar options</div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-black" checked={barCentered} onChange={e => setBarCentered(e.target.checked)} />
                    <span className="text-sm">Center time inside bar (auto on for small screens)</span>
                  </label>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
