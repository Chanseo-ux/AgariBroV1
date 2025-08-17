import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* ---------- time helpers (minute-precision) ---------- */
const MINS_IN_DAY = 1440;

const minsToLabel = (m) => {
  const mm = ((m % MINS_IN_DAY) + MINS_IN_DAY) % MINS_IN_DAY;
  const h24 = Math.floor(mm / 60);
  const min = mm % 60;
  const h12 = (h24 % 12) || 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  const minStr = String(min).padStart(2, "0");
  return `${h12}:${minStr} ${ampm}`;
};

// flexible parser: "9:30", "09:30", "9 30", "9", "21:15", "930", supports AM/PM
const parseTimeToMinutes = (s) => {
  if (!s) return NaN;
  let str = s.trim().toLowerCase();
  let isPM = false, isAM = false;
  if (str.endsWith("am")) { isAM = true; str = str.replace(/am$/, "").trim(); }
  if (str.endsWith("pm")) { isPM = true; str = str.replace(/pm$/, "").trim(); }
  str = str.replace(/[^\d:]/g, " ").replace(/\s+/g, " ").trim();
  let h = 0, m = 0;
  if (/^\d{1,2}:\d{1,2}$/.test(str)) {
    const [hh, mm] = str.split(":").map((x) => parseInt(x, 10));
    h = hh; m = mm;
  } else if (/^\d{3,4}$/.test(str)) {
    const n = parseInt(str, 10);
    if (str.length <= 2) { h = n; m = 0; }
    else { const mm = n % 100; const hh = Math.floor(n / 100); h = hh; m = mm; }
  } else {
    const parts = str.split(" ");
    if (parts.length === 2) { h = parseInt(parts[0], 10); m = parseInt(parts[1], 10); }
    else if (parts.length === 1) { h = parseInt(parts[0], 10); m = 0; }
  }
  if (isNaN(h) || isNaN(m)) return NaN;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  h = Math.max(0, Math.min(23, h));
  m = Math.max(0, Math.min(59, m));
  return h * 60 + m;
};

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/* ---------- default day: 24 hourly blocks ---------- */
const defaultDay = () =>
  Array.from({ length: 24 }, (_, h) => ({
    start: h * 60,
    span: 60,
    tasks: [],
  }));

const uid = () => Math.random().toString(36).slice(2, 9);

export default function DailyPlanner() {
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [showDayPanel, setShowDayPanel] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [now, setNow] = useState(new Date());

  // schedule with localStorage (v8)
  const [schedule, setSchedule] = useState(() => {
    const saved = localStorage.getItem("dailyPlanner.schedule.v8");
    if (saved) return JSON.parse(saved);
    const init = {};
    for (const d of DAYS) init[d] = defaultDay();
    return init;
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // autosave
  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem("dailyPlanner.schedule.v8", JSON.stringify(schedule));
    }, 120);
    return () => clearTimeout(id);
  }, [schedule]);

  const todayIdx = now.getDay();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  const daySlots = schedule[DAYS[selectedDay]];
  const setDaySlots = (updater) => {
    setSchedule((prev) => ({
      ...prev,
      [DAYS[selectedDay]]:
        typeof updater === "function" ? updater(prev[DAYS[selectedDay]]) : updater,
    }));
  };

  /* ---------- MERGE / UNMERGE ---------- */
  const mergeSlots = (i) => {
    setDaySlots((slots) => {
      if (i >= slots.length - 1) return slots;
      const next = [...slots];
      const a = next[i], b = next[i + 1];
      const aEnd = a.start + a.span;
      if (aEnd !== b.start) return slots; // only adjacent
      next[i] = { start: a.start, span: a.span + b.span, tasks: [...a.tasks, ...b.tasks] };
      next.splice(i + 1, 1);
      return next;
    });
  };

  const unmergeSlot = (i) => {
    setDaySlots((slots) => {
      const s = slots[i];
      if (!s || s.span <= 60) return slots;
      const first  = { start: s.start, span: 60, tasks: [...s.tasks] };
      const second = { start: s.start + 60, span: s.span - 60, tasks: [] };
      const next = [...slots];
      next.splice(i, 1, first);
      next.splice(i + 1, 0, second);
      return next;
    });
  };

  /* ---------- TASKS ---------- */
  const addTask = (i) => {
    const text = prompt("New task");
    if (!text) return;
    setDaySlots((slots) => {
      const next = [...slots];
      next[i] = { ...next[i], tasks: [...next[i].tasks, { id: uid(), text, done: false }] };
      return next;
    });
  };

  const updateTask = (i, tid, patch) => {
    setDaySlots((slots) => {
      const next = [...slots];
      next[i] = { ...next[i], tasks: next[i].tasks.map((t) => (t.id === tid ? { ...t, ...patch } : t)) };
      return next;
    });
  };

  const removeTask = (i, tid) => {
    setDaySlots((slots) => {
      const next = [...slots];
      next[i] = { ...next[i], tasks: next[i].tasks.filter((t) => t.id !== tid) };
      return next;
    });
  };

  /* ---------- APPLY BLOCK TO ALL DAYS ---------- */
  const replaceRangeWithSingleBlock = (slots, start, span, tasksForNewBlock) => {
    const end = start + span; // exclusive
    const next = [];
    let i = 0;

    while (i < slots.length) {
      const s = slots[i];
      const sStart = s.start;
      const sEnd = s.start + s.span;

    if (sEnd <= start || sStart >= end) {
        next.push({ ...s, tasks: [...s.tasks] });
        i++;
        continue;
      }

      if (sStart < start) {
        next.push({ start: sStart, span: start - sStart, tasks: [...s.tasks] });
      }

      let j = i;
      let rightRemainderSpan = 0;
      let rightRemainderTasks = [];
      while (j < slots.length) {
        const cur = slots[j];
        const curEnd = cur.start + cur.span;
        if (curEnd >= end) {
          const over = curEnd - end;
          if (over > 0) {
            rightRemainderSpan = over;
            rightRemainderTasks = [...cur.tasks];
          }
          j++;
          break;
        }
        j++;
      }

      next.push({ start, span, tasks: tasksForNewBlock });

      if (rightRemainderSpan > 0) {
        next.push({ start: end, span: rightRemainderSpan, tasks: rightRemainderTasks });
      }

      for (let k = j; k < slots.length; k++) {
        next.push({ ...slots[k], tasks: [...slots[k].tasks] });
      }

      return next;
    }

    return slots.map((blk) => ({ ...blk, tasks: [...blk.tasks] }));
  };

  const applyBlockToAllDays = (blockIndex, mode = "replace") => {
    setSchedule((prev) => {
      const next = { ...prev };
      const srcDay = DAYS[selectedDay];
      const srcBlock = prev[srcDay][blockIndex];
      if (!srcBlock) return prev;

      const { start, span, tasks } = srcBlock;
      const makeCopies = (arr) => arr.map((t) => ({ ...t, id: Math.random().toString(36).slice(2, 9) }));

      for (let d = 0; d < DAYS.length; d++) {
        const dayName = DAYS[d];
        const slots = prev[dayName];
        const initialTasks = mode === "replace" ? makeCopies(tasks) : [];
        let reshaped = replaceRangeWithSingleBlock(slots, start, span, initialTasks);
        if (mode === "append") {
          reshaped = reshaped.map((blk) =>
            blk.start === start && blk.span === span
              ? { ...blk, tasks: [...blk.tasks, ...makeCopies(tasks)] }
              : blk
          );
        }
        next[dayName] = reshaped;
      }
      return next;
    });
  };

  /* ---------- RESET ---------- */
  const resetSelectedDay = () => {
    if (!confirm(`Reset ${DAYS[selectedDay]} to 1-hour blocks and clear tasks?`)) return;
    setDaySlots(defaultDay());
  };

  /* ---------- CUSTOM TIME ---------- */
  const addCustomBlock = () => {
    const raw = prompt('Enter time range (e.g., "9:30 - 10", "13:15-14:05", "9 30~10 00", supports AM/PM)');
    if (!raw) return;
    const parts = raw.split(/-|–|~|to/i);
    if (parts.length < 2) { alert("Please enter a start and end time, like 9:30 - 10:00."); return; }
    const startMin = parseTimeToMinutes(parts[0]);
    const endMin = parseTimeToMinutes(parts[1]);
    if (isNaN(startMin) || isNaN(endMin)) { alert("Could not parse the time. Try formats like 9:30, 10, 1:05pm."); return; }
    let s = startMin, e = endMin;
    if (e <= s) { alert("End time must be after start time."); return; }
    s = Math.max(0, Math.min(MINS_IN_DAY - 1, s));
    e = Math.max(1, Math.min(MINS_IN_DAY, e));
    const span = e - s;
    setDaySlots((slots) => replaceRangeWithSingleBlock(slots, s, span, []));
  };

  /* ---------- COMPACT (follows SELECTED DAY) ---------- */
  const sourceIdx = selectedDay;
  const sourceSlots = schedule[DAYS[sourceIdx]];

  const findCurrentBlockIndex = (slots, isToday) => {
    const m = isToday ? (currentMinute % MINS_IN_DAY) : 0;
    let idx = slots.findIndex((s) => {
      const start = s.start % MINS_IN_DAY;
      const end = (s.start + s.span) % MINS_IN_DAY;
      if (s.span >= MINS_IN_DAY) return true;
      if (end > start) return m >= start && m < end;
      return m >= start || m < end;
    });
    if (idx === -1) {
      const fallback = slots.findIndex((s) => s.start >= m);
      idx = fallback !== -1 ? fallback : Math.max(0, slots.length - 1);
    }
    return idx;
  };

  const getCompactWindow = () => {
    const idx = findCurrentBlockIndex(sourceSlots, sourceIdx === todayIdx);
    const items = sourceSlots.slice(idx, Math.min(idx + 3, sourceSlots.length));
    return items.map((s) => {
      const end = (s.start + s.span) % MINS_IN_DAY;
      const texts = s.tasks.map((t) => t.text.trim()).filter(Boolean);
      const line1 = texts[0] || (texts.length === 0 ? "No tasks" : "");
      const line2 = texts.length > 1 ? texts[1] : "";
      const moreCount = Math.max(0, texts.length - 2);
      return { startLabel: minsToLabel(s.start), endLabel: minsToLabel(end), line1, line2, moreCount };
    });
  };

  /* ---------- Animations + outside click ---------- */
  const expandedRef = useRef(null);
  useEffect(() => {
    if (!isExpanded) return;
    const handleClickOutside = (e) => {
      if (expandedRef.current && !expandedRef.current.contains(e.target)) setIsExpanded(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  const cardVariants = {
    initial: { opacity: 0, y: -6, scaleY: 0.98 },
    animate: { opacity: 1, y: 0, scaleY: 1 },
    exit:    { opacity: 0, y: -6, scaleY: 0.98 },
  };
  const listVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
  };

  /* ---------- Render ---------- */
  return (
    <div className="w-full max-w-md mx-auto">
      <AnimatePresence initial={false} mode="wait">
        {!isExpanded ? (
          <motion.div
            key="compact"
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="border rounded-lg bg-white shadow overflow-hidden"
            style={{ transformOrigin: "top" }}
            onClick={() => setIsExpanded(true)}
          >
            <div className="p-3 cursor-pointer">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base md:text-lg font-bold">{DAYS[sourceIdx]}</h2>
                <span className="text-[11px] md:text-xs text-gray-500">
                  {sourceIdx === todayIdx
                    ? now.toLocaleString(undefined, {
                        month: "short", day: "numeric",
                        hour: "numeric", minute: "2-digit", hour12: true
                      })
                    : "Scheduled view"}
                </span>
              </div>

              <div className="mt-1.5">
                {getCompactWindow().map((slot, i) => (
                  <motion.div
                    key={`${slot.startLabel}-${i}`}
                    variants={listVariants}
                    initial="initial"
                    animate="animate"
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    className="flex items-start gap-2 border-b py-1 text-[13px]"
                  >
                    <span className="font-mono shrink-0">
                      {slot.startLabel} - {slot.endLabel}
                    </span>
                    <span className="flex-1 min-w-0 text-right">
                      <div className={`truncate ${slot.line1 === "No tasks" ? "text-gray-400" : ""}`}>{slot.line1}</div>
                      {slot.line2 && <div className="truncate">{slot.line2}</div>}
                      {slot.moreCount > 0 && <div className="text-[11px] text-gray-500">+{slot.moreCount} more</div>}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            ref={expandedRef}
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            className="border rounded-lg bg-white shadow overflow-hidden"
            style={{ transformOrigin: "top" }}
          >
            <div className="p-3">
              {/* Header: left = day label button (toggles day list), right = controls */}
              <div className="flex justify-between items-center mb-1.5 relative">
                {/* LEFT: Day label acts as dropdown trigger */}
                <button
                  onClick={() => setShowDayPanel((v) => !v)}
                  className="flex items-center gap-1 font-bold text-base md:text-lg px-2 py-1 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  aria-expanded={showDayPanel}
                  aria-controls="day-panel"
                  title="Change day"
                >
                  {DAYS[selectedDay]}
                  <span className="text-xs translate-y-[1px]">▼</span>
                </button>

                {/* RIGHT: small controls */}
                <div className="relative flex items-center gap-1">
                  <button
                    onClick={addCustomBlock}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                    title='Create a custom block (e.g., 9:30 - 10:00 or 1:05pm - 2:20pm)'
                  >
                    Custom time
                  </button>

                  <button
                    onClick={resetSelectedDay}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                    title="Reset this day to 1-hour blocks and clear tasks"
                  >
                    Reset day
                  </button>

                  <button
                    onClick={() => setIsExpanded(false)}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>

                {/* Day dropdown anchored under the left label */}
                <div
                  id="day-panel"
                  className={`absolute left-0 top-full mt-1 w-36 z-10 rounded-md border bg-white shadow-lg overflow-hidden origin-top transition-all duration-200 ease-out ${
                    showDayPanel ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0 pointer-events-none"
                  }`}
                  style={{ transformOrigin: "top" }}
                >
                  <ul className="flex flex-col">
                    {DAYS.map((day, i) => (
                      <li key={day}>
                        <button
                          onClick={() => { setSelectedDay(i); setShowDayPanel(false); }}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 ${
                            selectedDay === i ? "bg-blue-100 font-medium" : ""
                          }`}
                        >
                          {day}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="max-h-[640px] overflow-y-auto border-t">
                {daySlots.map((s, i) => {
                  const end = (s.start + s.span) % MINS_IN_DAY;
                  return (
                    <motion.div
                      key={`${s.start}-${i}`}
                      variants={listVariants}
                      initial="initial"
                      animate="animate"
                      transition={{ duration: 0.18, delay: i * 0.02 }}
                      className="border-b py-2.5 px-1.5 flex flex-col gap-2.5"
                    >
                      <div className="flex justify-between items-center">
                        <div className="text-[13px] w-56">
                          <div className="font-mono">{minsToLabel(s.start)} - {minsToLabel(end)}</div>
                          {s.span !== 60 && <div className="text-[11px] text-gray-500">({Math.round(s.span)} min block)</div>}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => applyBlockToAllDays(i, "replace")}
                            className="text-[11px] px-2 py-1 border rounded hover:bg-gray-100"
                            title="Copy this block’s time range and tasks to all days"
                          >
                            Apply to all
                          </button>

                          {i < daySlots.length - 1 && (
                            <button
                              onClick={() => mergeSlots(i)}
                              className="text-green-600 hover:text-green-800 text-sm leading-none"
                              title="Merge with next (adjacent) block"
                            >
                              +
                            </button>
                          )}
                          {s.span > 60 && (
                            <button
                              onClick={() => unmergeSlot(i)}
                              className="text-red-600 hover:text-red-800 text-sm leading-none"
                              title="Unmerge (split off 60 min)"
                            >
                              –
                            </button>
                          )}
                        </div>
                      </div>

                      {/* SINGLE task list for the whole block */}
                      <div className="pl-1">
                        {s.tasks.length === 0 && <div className="text-sm text-gray-400">No tasks</div>}
                        <ul className="space-y-1.5">
                          {s.tasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={t.done}
                                onChange={() => updateTask(i, t.id, { done: !t.done })}
                              />
                              <input
                                type="text"
                                value={t.text}
                                onChange={(e) => updateTask(i, t.id, { text: e.target.value })}
                                className={`flex-1 border-b text-sm outline-none ${t.done ? "line-through text-gray-400" : ""}`}
                                placeholder="Task..."
                              />
                              <button
                                onClick={() => removeTask(i, t.id)}
                                className="text-[11px] text-red-600 hover:text-red-800"
                              >
                                delete
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => addTask(i)}
                          className="mt-1.5 text-[11px] px-2 py-1 border rounded hover:bg-gray-100"
                        >
                          + Add task
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
