import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * MusicPlayer — JSX (no shuffle) + Framer Motion
 * - Auto-advance strictly sequential (wrap at end)
 * - Repeat button toggles Repeat One (loop AFTER finish; no restart on press)
 * - Click outside the music player when on Songs screen → back to Playlists (playback continues)
 * - Smooth springy transitions + lively row animations
 * - Songs list scrolls past the last row
 * - Search YouTube (VITE_YT_API_KEY required)
 * - LocalStorage persistence; YT Iframe API safe guards
 */

const STORAGE = {
  playlists: "ytmini.playlists",            // { [name]: Track[] }
  idxMap: "ytmini.currentIdxMap",           // { [name]: number }
  repeat: "ytmini.repeatMode",              // { [name]: "off"|"one" }
  active: "ytmini.activePlaylist",          // string
  volume: "ytmini.volume",                  // number 0..100
  listScroll: "ytmini.playlistListScroll",  // number
};

const coverUrl = (videoId, fallback) =>
  videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : (fallback || "");

export default function MusicPlayer() {
  const API_KEY = import.meta.env.VITE_YT_API_KEY || "";

  /* ---------- Persistent state ---------- */
  const [playlists, setPlaylists] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.playlists)) || { Default: [] }; }
    catch { return { Default: [] }; }
  });
  const names = Object.keys(playlists);

  const [activeName, setActiveName] = useState(() => {
    const n = localStorage.getItem(STORAGE.active);
    const obj = (() => { try { return JSON.parse(localStorage.getItem(STORAGE.playlists)) || {}; } catch { return {}; } })();
    return (n && obj[n] ? n : Object.keys(obj)[0]) || "Default";
  });

  const [idxMap, setIdxMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.idxMap)) || {}; }
    catch { return {}; }
  });

  const [repeatByName, setRepeatByName] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.repeat)) || {}; }
    catch { return {}; }
  }); // "off" | "one"

  const [volume, setVolume] = useState(() => {
    const v = Number(localStorage.getItem(STORAGE.volume));
    return Number.isFinite(v) ? v : 80;
  });

  // Persist
  useEffect(() => localStorage.setItem(STORAGE.playlists, JSON.stringify(playlists)), [playlists]);
  useEffect(() => localStorage.setItem(STORAGE.active, activeName), [activeName]);
  useEffect(() => localStorage.setItem(STORAGE.idxMap, JSON.stringify(idxMap)), [idxMap]);
  useEffect(() => localStorage.setItem(STORAGE.repeat, JSON.stringify(repeatByName)), [repeatByName]);
  useEffect(() => localStorage.setItem(STORAGE.volume, String(volume)), [volume]);

  /* ---------- Derived ---------- */
  useEffect(() => {
    if (!names.includes(activeName)) setActiveName(names[0] || "Default");
  }, [names, activeName]);

  const playlist = playlists[activeName] || [];
  const currentIdx = Number.isFinite(idxMap[activeName]) ? idxMap[activeName] : -1;
  const setCurrentIdx = (iOrFn) =>
    setIdxMap((p) => ({ ...p, [activeName]: typeof iOrFn === "function" ? iOrFn(p[activeName] ?? -1) : iOrFn }));

  const repeatMode = repeatByName[activeName] || "off";
  const setRepeatMode = (m) => setRepeatByName((p) => ({ ...p, [activeName]: m }));

  const current = useMemo(
    () => (currentIdx >= 0 && currentIdx < playlist.length ? playlist[currentIdx] : null),
    [currentIdx, playlist]
  );

  /* ---------- Screen switching ---------- */
  const [screen, setScreen] = useState("playlists"); // "playlists" | "songs"

  const listRef = useRef(null);
  const [savedScroll, setSavedScroll] = useState(() => Number(localStorage.getItem(STORAGE.listScroll) || 0));
  useLayoutEffect(() => {
    if (listRef.current && screen === "playlists") listRef.current.scrollTop = savedScroll || 0;
  }, [screen, savedScroll]);

  const goSongs = (name) => {
    setActiveName(name);
    if (listRef.current) {
      const st = listRef.current.scrollTop || 0;
      setSavedScroll(st);
      localStorage.setItem(STORAGE.listScroll, String(st));
    }
    setScreen("songs");
  };
  const goPlaylists = () => setScreen("playlists");

  /* ---------- Search ---------- */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showResults, setShowResults] = useState(false);

  const doSearch = async (e) => {
    e?.preventDefault?.();
    if (!query.trim()) return;
    if (!API_KEY) { setErr("Add VITE_YT_API_KEY to .env"); return; }
    setLoading(true); setErr("");
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("videoCategoryId", "10");
      url.searchParams.set("q", query.trim());
      url.searchParams.set("maxResults", "15");
      url.searchParams.set("key", API_KEY);
      const r = await fetch(url);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "API error");
      const items = (j.items || []).map((it) => ({
        videoId: it.id.videoId,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        thumb: it.snippet.thumbnails?.default?.url,
      }));
      setResults(items);
      setShowResults(true);
    } catch (e2) {
      console.error(e2);
      setErr("Search failed (key/quota?).");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- YouTube Iframe API ---------- */
  const rootRef = useRef(null);          // whole player root (for outside click detect)
  const containerRef = useRef(null);     // YT iframe container
  const playerRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  useEffect(() => {
    if (window.YT?.Player) { setYtReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.body.appendChild(s);
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
    return () => {};
  }, []);

  useEffect(() => {
    if (!ytReady || playerRef.current || !containerRef.current || !window.YT?.Player) return;
    playerRef.current = new window.YT.Player(containerRef.current, {
      height: "0",
      width: "0",
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onReady: (e) => {
          e.target.setVolume?.(volume);
          // Fix: keep hidden iframe from stealing keyboard
          const iframe = e.target.getIframe?.();
          if (iframe) {
            iframe.setAttribute("tabindex", "-1");
            iframe.setAttribute("aria-hidden", "true");
            try { iframe.blur(); } catch {}
          }
        },
        onStateChange: (e) => {
          const Y = window.YT?.PlayerState;
          if (!Y) return;
          if (e.data === Y.PLAYING) { setIsPlaying(true); setNeedsGesture(false); }
          if (e.data === Y.PAUSED) setIsPlaying(false);
          if (e.data === Y.ENDED) handleEnded();
        },
      },
    });
  }, [ytReady, volume]);

  // Load & play on current change
  const lastLoadedVideoIdRef = useRef(null);
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !current || typeof p.loadVideoById !== "function") return;

    const newId = current.videoId;
    const prevId = lastLoadedVideoIdRef.current;

    try {
      if (prevId === newId) {
        const maybe = p.playVideo?.();
        if (maybe && typeof maybe.then === "function") maybe.catch(() => setNeedsGesture(true));
        setIsPlaying(true);
        return;
      }
      p.loadVideoById(newId);
      p.setVolume?.(volume);
      const maybe = p.playVideo?.();
      if (maybe && typeof maybe.then === "function") maybe.catch(() => setNeedsGesture(true));
      setIsPlaying(true);
      lastLoadedVideoIdRef.current = newId || null;
    } catch (e) {
      console.error(e);
    }
  }, [currentIdx, current, volume]);

  useEffect(() => { playerRef.current?.setVolume?.(volume); }, [volume]);

  /* ---------- Progress polling ---------- */
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const pendingSeekRef = useRef(null);

  useEffect(() => {
    let id;
    const tick = () => {
      const p = playerRef.current;
      if (!p) return;
      const dur = p.getDuration?.() ?? 0;
      const t = p.getCurrentTime?.() ?? 0;
      if (!seeking) setCurTime(Number.isFinite(t) ? t : 0);
      setDuration(Number.isFinite(dur) ? dur : 0);
    };
    if (screen === "songs" && currentIdx >= 0) {
      id = setInterval(tick, 500);
      tick();
    }
    return () => { if (id) clearInterval(id); };
  }, [screen, currentIdx, seeking]);

  const formatTime = (s) => {
    if (!Number.isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  /* ---------- Playback + repeat ---------- */
  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) { if (playlist.length) setCurrentIdx((prev) => Math.max(0, prev ?? 0)); return; }
    if (!current && playlist.length) { setCurrentIdx(0); return; }
    const Y = window.YT?.PlayerState;
    const st = p?.getPlayerState?.();
    if (st === Y.PLAYING) { p.pauseVideo?.(); setIsPlaying(false); }
    else {
      const maybe = p.playVideo?.();
      if (maybe && typeof maybe.then === "function") maybe.catch(() => setNeedsGesture(true));
      setIsPlaying(true);
    }
  };

  const playByIndex = (i) => {
    if (i < 0 || i >= playlist.length) return;
    if (!playerRef.current || !ytReady) { setCurrentIdx(i); return; }
    if (i === currentIdx) togglePlay();
    else setCurrentIdx(i);
  };

  const restartCurrent = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.seekTo?.(0, true);
      const maybe = p.playVideo?.();
      if (maybe && typeof maybe.then === "function") maybe.catch(() => setNeedsGesture(true));
      setIsPlaying(true);
    } catch {}
  };

  // Double-advance guard
  const lastAdvanceRef = useRef(0);

  const handleEnded = () => {
    if (!playlist.length) return;
    if (repeatMode === "one") { restartCurrent(); return; }
    const now = Date.now();
    if (now - lastAdvanceRef.current < 700) return;
    lastAdvanceRef.current = now;
    setCurrentIdx((prev) => {
      const n = playlist.length;
      if (!Number.isInteger(prev) || prev < 0) return n > 0 ? 0 : -1;
      return n > 0 ? (prev + 1) % n : -1;
    });
  };

  const toggleRepeatOne = () => {
    setRepeatMode(repeatMode === "one" ? "off" : "one");
  };

  /* ---------- Playlist CRUD ---------- */
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState("");
  const [confirmDel, setConfirmDel] = useState({ open: false, name: "" });

  const createPlaylist = (nameRaw) => {
    const name = (nameRaw || "").trim() || "Untitled";
    if (playlists[name]) return;
    setPlaylists((p) => ({ ...p, [name]: [] }));
    setIdxMap((p) => ({ ...p, [name]: -1 }));
    setRepeatByName((p) => ({ ...p, [name]: "off" }));
    setActiveName(name);
  };

  const trulyDeletePlaylist = (name) => {
    const keys = Object.keys(playlists);
    if (keys.length <= 1) return;
    const { [name]: _, ...rest } = playlists;
    setPlaylists(rest);
    setIdxMap(({ [name]: __, ...r }) => r);
    setRepeatByName(({ [name]: __m, ...mr }) => mr);
    if (activeName === name) setActiveName(Object.keys(rest)[0] || "Default");
  };

  const renamePlaylist = (oldName, newNameRaw) => {
    const newName = (newNameRaw || "").trim();
    if (!newName || newName === oldName || playlists[newName]) return;
    setPlaylists((prev) => {
      const { [oldName]: val, ...rest } = prev;
      return { ...rest, [newName]: val };
    });
    setIdxMap((prev) => {
      const { [oldName]: v, ...rest } = prev;
      return { ...rest, [newName]: v };
    });
    setRepeatByName((prev) => {
      const { [oldName]: v, ...rest } = prev;
      return { ...rest, [newName]: v || "off" };
    });
    if (activeName === oldName) setActiveName(newName);
  };

  /* ---------- Track ops ---------- */
  const addToActive = (t, playNow = false) => {
    setPlaylists((prev) => {
      const arr = prev[activeName] || [];
      if (arr.some((x) => x.videoId === t.videoId)) return prev;
      return { ...prev, [activeName]: [...arr, t] };
    });
    if (playNow) {
      const idx = playlist.findIndex((x) => x.videoId === t.videoId);
      if (idx >= 0) setCurrentIdx(idx);
      else setCurrentIdx(playlist.length);
    }
  };

  const removeAt = (idx) => {
    setPlaylists((prev) => {
      const arr = (prev[activeName] || []).slice();
      arr.splice(idx, 1);
      return { ...prev, [activeName]: arr };
    });
    if (idx === currentIdx) {
      const newLen = playlist.length - 1;
      setCurrentIdx(newLen <= 0 ? -1 : Math.min(idx, newLen - 1));
      setIsPlaying(false);
    } else if (idx < currentIdx) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const moveItem = (from, to) => {
    if (from === to) return;
    setPlaylists((prev) => {
      const arr = (prev[activeName] || []).slice();
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...prev, [activeName]: arr };
    });
    if (currentIdx === from) setCurrentIdx(to);
    else if (from < currentIdx && to >= currentIdx) setCurrentIdx(currentIdx - 1);
    else if (from > currentIdx && to <= currentIdx) setCurrentIdx(currentIdx + 1);
  };

  /* ---------- DnD & UI ---------- */
  const [dragIndex, setDragIndex] = useState(-1);
  const [dragOverIndex, setDragOverIndex] = useState(-1);
  const onDragStart = (i) => setDragIndex(i);
  const onDragOver = (e, i) => { e.preventDefault(); setDragOverIndex(i); };
  const onDrop = (i) => { if (dragIndex >= 0 && i >= 0 && dragIndex !== i) moveItem(dragIndex, i); setDragIndex(-1); setDragOverIndex(-1); };
  const onDragEnd = () => { setDragIndex(-1); setDragOverIndex(-1); };

  const [openRow, setOpenRow] = useState(-1);

  /* ---------- Height sync ---------- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const prev = el ? el.previousElementSibling : null;
    const apply = () => {
      const min = 480;
      if (prev) {
        const h = prev.getBoundingClientRect().height;
        if (h > 0) { el.style.height = `${Math.max(h, min)}px`; return; }
      }
      el.style.height = `${min}px`;
    };

    const ro = prev ? new ResizeObserver(apply) : null;
    if (prev && ro) ro.observe(prev);
    window.addEventListener("resize", apply);
    apply();

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", apply);
      el.style.height = "";
    };
  }, []);

  /* ---------- Confirmations ---------- */
  const [confirmSongDel, setConfirmSongDel] = useState({ open: false, index: -1 });
  const [confirmClear, setConfirmClear] = useState({ open: false });

  /* ---------- Click OUTSIDE player to go back (when on Songs) ---------- */
  const downRef = useRef({ x: 0, y: 0, t: 0 });
  useEffect(() => {
    const onDown = (e) => {
      if (e.button !== 0) return;
      downRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0, t: performance.now() };
    };
    const onUp = (e) => {
      if (screen !== "songs") return;
      if (e.button !== 0) return;
      if (confirmDel.open || confirmSongDel.open || confirmClear.open) return;

      const root = rootRef.current;
      const target = e.target;
      if (root && root.contains(target)) return;

      const dx = Math.abs((e.clientX ?? 0) - downRef.current.x);
      const dy = Math.abs((e.clientY ?? 0) - downRef.current.y);
      if (dx > 6 || dy > 6) return;

      goPlaylists();
    };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
    };
  }, [screen, confirmDel.open, confirmSongDel.open, confirmClear.open]);

  /* ---------- Global key handler (ignore when typing) ---------- */
  useEffect(() => {
    const onKey = (e) => {
      // Ignore ALL globals while typing in input/textarea/contentEditable
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;

      if (e.key === "Escape") {
        if (showResults) setShowResults(false);
        else if (screen === "songs") goPlaylists();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, showResults]);

  /* ---------- Framer Motion variants ---------- */
  const screenVariants = {
    initial: { opacity: 0, y: 10, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 280, damping: 28 } },
    exit:    { opacity: 0, y: 10, scale: 0.985, transition: { duration: 0.18 } },
  };
  const songsVariants = {
    initial: { opacity: 0, y: 10, scale: 0.992 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 280, damping: 28 } },
    exit:    { opacity: 0, y: 10, scale: 0.992, transition: { duration: 0.18 } },
  };

  /* ---------- Render ---------- */
  return (
    <div ref={rootRef} className="mt-4 border rounded-lg bg-white shadow overflow-hidden h-full relative">
      {/* Hidden YouTube iframe host */}
      <div className="sr-only" aria-hidden="true">
        <div ref={containerRef} />
      </div>

      {/* Title */}
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold">Music Player</h3>
      </div>

      {/* Layered screens with Framer Motion */}
      <div className="relative min-h-0 h-full">
        <AnimatePresence mode="wait" initial={false}>
          {screen === "playlists" && (
            <motion.div
              key="playlists"
              className="absolute inset-0"
              variants={screenVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="flex flex-col h-full min-h-0">
                <div className="p-3 border-b flex items-center justify-between">
                  <div className="text-xs text-gray-500">Playlists</div>
                  {!creating ? (
                    <button onClick={() => setCreating(true)} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">+ New</button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        className="text-sm border rounded px-2 py-1 w-40"
                        placeholder="Playlist name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (createPlaylist(newName), setNewName(""), setCreating(false))}
                      />
                      <button onClick={() => { createPlaylist(newName); setNewName(""); setCreating(false); }} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">Create</button>
                      <button onClick={() => { setCreating(false); setNewName(""); }} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">Cancel</button>
                    </div>
                  )}
                </div>

                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                  {names.length === 0 ? (
                    <div className="text-sm text-gray-400">No playlists yet. Create one above.</div>
                  ) : (
                    <ul className="space-y-2">
                      {names.map((n) => (
                        <motion.li
                          key={n}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 26 } }}
                          className="border rounded px-3 py-2 flex items-center gap-2"
                        >
                          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => goSongs(n)}>
                            <div className="truncate text-sm font-medium">{n}</div>
                            <div className="text-[11px] text-gray-500">({(playlists[n] || []).length})</div>
                          </div>

                          {renaming === n ? (
                            <input
                              autoFocus
                              className="text-xs border rounded px-2 py-1 w-40"
                              defaultValue={n}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { renamePlaylist(n, e.currentTarget.value); setRenaming(""); }
                                if (e.key === "Escape") setRenaming("");
                              }}
                              onBlur={(e) => { renamePlaylist(n, e.target.value); setRenaming(""); }}
                            />
                          ) : (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setRenaming(n); }} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">Rename</button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (names.length <= 1) return;
                                  setConfirmDel({ open: true, name: n });
                                }}
                                className="px-2 py-1 text-xs border rounded hover:bg-gray-100 text-red-600"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {screen === "songs" && (
            <motion.div
              key="songs"
              className="absolute inset-0"
              variants={songsVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="absolute inset-0 z-10 flex flex-col bg-white min-h-0">
                {/* Header */}
                <motion.div
                  className="p-3 border-b flex items-center gap-2"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 320, damping: 26 } }}
                >
                  <button onClick={goPlaylists} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">← Back</button>
                  <div className="font-medium text-sm">{activeName}</div>
                  <span className="text-[11px] text-gray-500">({playlist.length})</span>

                  <div className="ml-auto flex items-center gap-2">
                    {needsGesture && (
                      <span className="text-[11px] text-gray-600">Press Play to start.</span>
                    )}

                    {/* Repeat: toggle OFF ⇄ ONE */}
                    <button
                      onClick={toggleRepeatOne}
                      className={`px-2 py-1 text-xs border rounded transition-colors duration-200 ${
                        repeatMode === "one"
                          ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                          : "text-gray-600"
                      }`}
                      title={repeatMode === "one" ? "Repeat One" : "Repeat Off"}
                    >
                      🔂
                    </button>

                    <button
                      onClick={() => setConfirmClear({ open: true })}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                    >
                      Clear
                    </button>
                  </div>
                </motion.div>

                {/* Search */}
                <div className="p-3 border-b flex flex-col gap-2">
                  <form onSubmit={doSearch} className="flex items-center gap-2">
                    <input
                      className="flex-1 border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Search YouTube… (e.g., K-pop, lo-fi, artist name)"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      // Keep typing keys (letters/digits/space) from bubbling to page/iframe
                      onKeyDown={(e) => {
                        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                          e.stopPropagation();
                        }
                      }}
                      autoFocus
                      enterKeyHint="search"
                    />
                    <button type="submit" disabled={loading} className="px-3 py-2 text-sm border rounded hover:bg-gray-100 disabled:opacity-60">
                      {loading ? "Searching…" : "Search"}
                    </button>
                  </form>

                  <div className={`overflow-hidden transition-all duration-200 ${showResults ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
                    {showResults && (
                      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                        <span>Results {results.length ? `(${results.length})` : ""}</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setShowResults(false)} className="px-2 py-1 border rounded hover:bg-gray-100">Close</button>
                        </div>
                      </div>
                    )}
                  </div>
                  {showResults && results.length > 0 && (
                    <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-2">
                      {results.map((t) => (
                        <li
                          key={t.videoId}
                          className="flex items-center gap-2 text-sm rounded px-1 py-1 cursor-pointer hover:bg-gray-50"
                          onClick={() => {
                            const idx = playlist.findIndex((x) => x.videoId === t.videoId);
                            if (idx >= 0) { if (idx === currentIdx) togglePlay(); else setCurrentIdx(idx); }
                            else addToActive(t, true);
                            setShowResults(false); setResults([]); setQuery(""); setErr("");
                          }}
                          title="Add to playlist and play (or toggle if currently playing)"
                        >
                          <img src={coverUrl(t.videoId, t.thumb)} alt="" className="w-10 h-7 rounded object-cover" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{t.title}</div>
                            <div className="text-[11px] text-gray-500 truncate">{t.channel}</div>
                          </div>
                          <button
                            className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToActive(t, false);
                              setShowResults(false); setResults([]); setQuery(""); setErr("");
                            }}
                          >
                            + Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {err && <div className="text-xs text-red-600">{err}</div>}
                </div>

                {/* Songs list */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 pb-32 pr-3 bg-transparent">
                  <div className="border rounded">
                    <div className="px-3 py-2 border-b text-xs text-gray-500">Songs</div>
                    {playlist.length === 0 ? (
                      <div className="p-3 text-sm text-gray-400">Empty. Search and add some tracks.</div>
                    ) : (
                      <ul className="p-3 space-y-1.5">
                        {playlist.map((t, i) => {
                          const active = i === currentIdx;
                          const dragging = i === dragIndex;
                          const over = i === dragOverIndex;
                          const rowOpen = openRow === i;

                          return (
                            <motion.li
                              key={`${t.videoId}-${i}`}
                              layout
                              initial={{ opacity: 0, y: 6, scale: 0.995 }}
                              animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 320, damping: 26 } }}
                              className={`rounded px-1 py-1 ${active ? "bg-blue-50" : "hover:bg-gray-50"} ${over ? "ring-2 ring-blue-200" : ""} ${dragging ? "opacity-60" : ""}`}
                              draggable={openRow !== i}
                              onDragStart={() => onDragStart(i)}
                              onDragOver={(e) => onDragOver(e, i)}
                              onDrop={() => onDrop(i)}
                              onDragEnd={onDragEnd}
                            >
                              <div className="flex items-center gap-2">
                                {/* Cover (click to play/toggle) */}
                                <button
                                  className={`relative w-10 h-10 rounded overflow-hidden border ${active ? "border-blue-300" : "border-transparent"} focus:outline-none`}
                                  title={active ? (isPlaying ? "Pause" : "Play") : "Play"}
                                  onClick={() => playByIndex(i)}
                                >
                                  <img src={coverUrl(t.videoId, t.thumb)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                                  <span className="absolute inset-0 grid place-items-center text-[12px] bg-black/0 hover:bg-black/10 transition">
                                    {active ? (isPlaying ? "⏸" : "▶") : "▶"}
                                  </span>
                                </button>

                                <div
                                  className="min-w-0 flex-1 cursor-pointer"
                                  onClick={() => playByIndex(i)}
                                  title={active ? (isPlaying ? "Pause" : "Play") : "Play this track"}
                                >
                                  <div className={`truncate ${active ? "font-medium" : ""}`}>{t.title}</div>
                                  <div className="text-[11px] text-gray-500 truncate">{t.channel}</div>
                                </div>

                                <button
                                  onClick={() => setOpenRow(rowOpen ? -1 : i)}
                                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                                  title="Show track controls"
                                >
                                  {rowOpen ? "▾" : "▸"}
                                </button>

                                <button
                                  onClick={() => setConfirmSongDel({ open: true, index: i })}
                                  className="px-2 py-1 text-xs border rounded hover:bg-gray-100 text-red-600"
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </div>

                              {rowOpen && (
                                <div className="mt-2 ml-[56px] mr-1 rounded border p-2 bg-white">
                                  <div className="flex flex-wrap items-center gap-3 w-full">
                                    {/* Order */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-gray-500">Order</span>
                                      <button
                                        onClick={() => moveItem(i, Math.max(0, i - 1))}
                                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                                        title="Move up"
                                      >
                                        ↑
                                      </button>
                                      <button
                                        onClick={() => moveItem(i, Math.min(playlist.length - 1, i + 1))}
                                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                                        title="Move down"
                                      >
                                        ↓
                                      </button>
                                    </div>

                                    {/* Volume (global) */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-gray-500">vol</span>
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={volume}
                                        onChange={(e) => setVolume(Number(e.target.value))}
                                        className="cursor-pointer select-none touch-none"
                                        onDragStart={(e) => e.preventDefault()}
                                      />
                                    </div>

                                    {/* Transport + Progress */}
                                    <div className="ml-auto flex items-center gap-3 w-full max-w-[560px]">
                                      <button
                                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100 select-none touch-none"
                                        title={active ? (isPlaying ? "Pause" : "Play") : "Play"}
                                        onClick={(e) => { e.stopPropagation(); active ? togglePlay() : playByIndex(i); }}
                                      >
                                        {active && isPlaying ? "⏸" : "▶️"}
                                      </button>

                                      <span className="text-[11px] tabular-nums text-gray-600 w-12 text-right">
                                        {active ? formatTime(seeking && pendingSeekRef.current != null ? pendingSeekRef.current : curTime) : "00:00"}
                                      </span>

                                      <input
                                        type="range"
                                        min={0}
                                        step={0.1}
                                        max={Math.max(0, duration)}
                                        value={active ? (seeking && pendingSeekRef.current != null ? pendingSeekRef.current : curTime) : 0}
                                        disabled={!active || duration <= 0}
                                        className="flex-1 cursor-pointer select-none touch-none"
                                        title="Seek"
                                        onPointerDown={() => { if (active && duration > 0) setSeeking(true); }}
                                        onChange={(e) => { if (active && duration > 0) pendingSeekRef.current = Number(e.target.value); }}
                                        onPointerUp={() => {
                                          if (!active || duration <= 0) return;
                                          if (pendingSeekRef.current != null) {
                                            const p = playerRef.current;
                                            const dur = duration || p?.getDuration?.() || 0;
                                            const target = Math.max(0, Math.min(pendingSeekRef.current, dur));
                                            if (dur - target <= 1.0) {
                                              p?.seekTo?.(Math.max(0, dur - 0.2), true);
                                            } else {
                                              p?.seekTo?.(target, true);
                                            }
                                          }
                                          setSeeking(false);
                                          pendingSeekRef.current = null;
                                        }}
                                        onPointerCancel={() => { setSeeking(false); pendingSeekRef.current = null; }}
                                      />

                                      <span className="text-[11px] tabular-nums text-gray-600 w-12">
                                        {active && duration > 0 ? formatTime(duration) : "00:00"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </motion.li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="h-12" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete confirmation modal (Playlist) */}
      {confirmDel.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 opacity-100 transition-opacity duration-150" onClick={() => setConfirmDel({ open: false, name: "" })} />
          <div className="relative z-10 w-[min(92vw,420px)] rounded-lg bg-white shadow-lg border p-4 transform transition-all duration-200">
            <div className="text-sm font-medium mb-1">Delete playlist</div>
            <div className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-medium">“{confirmDel.name}”</span>?
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100" onClick={() => setConfirmDel({ open: false, name: "" })}>Cancel</button>
              <button
                className="px-3 py-1.5 text-sm border rounded text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (Object.keys(playlists).length <= 1) { setConfirmDel({ open: false, name: "" }); return; }
                  trulyDeletePlaylist(confirmDel.name);
                  setConfirmDel({ open: false, name: "" });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal (Song) */}
      {confirmSongDel.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 opacity-100 transition-opacity duration-150" onClick={() => setConfirmSongDel({ open: false, index: -1 })} />
          <div className="relative z-10 w-[min(92vw,420px)] rounded-lg bg-white shadow-lg border p-4 transform transition-all duration-200">
            <div className="text-sm font-medium mb-1">Delete song</div>
            <div className="text-sm text-gray-600">Are you sure you want to delete this song from “{activeName}”?</div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100" onClick={() => setConfirmSongDel({ open: false, index: -1 })}>Cancel</button>
              <button
                className="px-3 py-1.5 text-sm border rounded text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirmSongDel.index >= 0) removeAt(confirmSongDel.index);
                  setConfirmSongDel({ open: false, index: -1 });
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear confirmation modal */}
      {confirmClear.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 opacity-100 transition-opacity duration-150" onClick={() => setConfirmClear({ open: false })} />
          <div className="relative z-10 w-[min(92vw,420px)] rounded-lg bg-white shadow-lg border p-4 transform transition-all duration-200">
            <div className="text-sm font-medium mb-1">Clear songs</div>
            <div className="text-sm text-gray-600">Are you sure you want to clear all songs in “{activeName}”?</div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100" onClick={() => setConfirmClear({ open: false })}>Cancel</button>
              <button
                className="px-3 py-1.5 text-sm border rounded text-red-600 hover:bg-red-50"
                onClick={() => {
                  setPlaylists((p) => ({ ...p, [activeName]: [] }));
                  setCurrentIdx(-1);
                  setIsPlaying(false);
                  lastLoadedVideoIdRef.current = null;
                  setConfirmClear({ open: false });
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
