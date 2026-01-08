
import React, { useState, useEffect } from "react";
import * as signalR from '@microsoft/signalr';
import ChessBoard from "./components/ChessBoard";
// initialBoard removed to force server authoritative load
import { saveGame, getSaves, loadGame, getBoard } from './api/gameApi';


function App() {
    const [board, setBoard] = useState(null);
    const [currentPlayer, setCurrentPlayer] = useState("w");
    const [message, setMessage] = useState("");
    const [saveName, setSaveName] = useState("");
    const [messageType, setMessageType] = useState("info"); // "info" | "error" | "success"]
    const [saves, setSaves] = useState([]);
    const [saveTrigger, setSaveTrigger] = useState(0);
    const [serverSynced, setServerSynced] = useState(false);
    const [boardKey, setBoardKey] = useState(0);
    const [captured, setCaptured] = useState({ w: [], b: [] });

    const addCaptured = (piece) => {
        if (!piece || !piece.color) return;
        const item = { type: piece.type, color: piece.color, id: Date.now() + Math.random() };
        setCaptured(prev => ({ ...prev, [piece.color]: [...(prev[piece.color] || []), item] }));
    };

    // helper to normalize captured entries from server into { type: 'P', color: 'w' }
    const normalizeCapturedList = (list) => {
        if (!Array.isArray(list)) return [];
        const typeNameToLetter = { King: 'K', Queen: 'Q', Rook: 'R', Bishop: 'B', Knight: 'N', Pawn: 'P' };
        const colorNameToLetter = { White: 'w', Black: 'b' };
        const out = [];
        for (const p of list) {
            if (!p) continue;
            const t = p.type ?? p.Type ?? '';
            const c = p.color ?? p.Color ?? '';
            let typeLetter = null;
            if (typeof t === 'string') {
                if (t.length === 1) typeLetter = t.toUpperCase(); else typeLetter = typeNameToLetter[t] ?? null;
            } else if (typeof t === 'number') {
                const numMap = { 0: 'K', 1: 'Q', 2: 'R', 3: 'B', 4: 'N', 5: 'P' };
                typeLetter = numMap[t];
            }
            let colorLetter = null;
            if (typeof c === 'string') {
                if (c.length === 1) colorLetter = c.toLowerCase(); else colorLetter = colorNameToLetter[c] ?? null;
            } else if (typeof c === 'number') {
                colorLetter = c === 0 ? 'w' : 'b';
            }
            if (!typeLetter || !colorLetter) continue;
            out.push({ type: typeLetter, color: colorLetter, id: Date.now() + Math.random() });
        }
        return out;
    };

    // Persist captured to localStorage so other tabs/windows receive updates
    useEffect(() => {
        try {
            localStorage.setItem('chess_captured', JSON.stringify(captured || { w: [], b: [] }));
            // keep debug log for diagnostics
            console.debug('[App] persisted captured', captured);
        } catch (e) {
            // ignore
        }
    }, [captured]);

    // Hydrate captured from localStorage on mount and listen for storage events
    useEffect(() => {
        try {
            const raw = localStorage.getItem('chess_captured');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') setCaptured({ w: parsed.w || [], b: parsed.b || [] });
            }
        } catch (e) {
            // ignore
        }

        const onStorage = (ev) => {
            if (!ev || !ev.key) return;
            try {
                if (ev.key === 'chess_captured') {
                    const parsed = JSON.parse(ev.newValue || '{}');
                    if (parsed && typeof parsed === 'object') {
                        console.debug('[App] storage event received chess_captured', parsed);
                        setCaptured({ w: parsed.w || [], b: parsed.b || [] });
                    }
                    return;
                }
                if (ev.key === 'chess_sync') {
                    const parsed = JSON.parse(ev.newValue || '{}');
                    if (parsed && typeof parsed === 'object' && parsed.captured) {
                        console.debug('[App] storage event received chess_sync', parsed);
                        const cap = parsed.captured;
                        setCaptured({ w: normalizeCapturedList(cap.w || []), b: normalizeCapturedList(cap.b || []) });
                    }
                    return;
                }
                if (ev.key === 'chess_saves_sync') {
                    console.debug('[App] storage event received chess_saves_sync', ev.newValue);
                    // Refresh saves list in other tabs
                    (async () => {
                        try {
                            const list = await getSaves();
                            setSaves((list || []).map(normalizeSave));
                        } catch (e) {
                            console.warn('Failed to refresh saves from storage event', e);
                        }
                    })();
                    return;
                }
            } catch (e) {
                // ignore
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const normalizeSave = (s) => ({
        Id: s.Id ?? s.id ?? '',
        Name: s.Name ?? s.name ?? '',
        FileName: s.FileName ?? s.fileName ?? s.file ?? '',
        TimestampUtc: s.TimestampUtc ?? s.timestampUtc ?? s.timestamp ?? s.time ?? ''
    });

    // helper to map backend DTO to frontend board format
    const mapDtoToBoard = (dto) => {
        const typeNameToLetter = { King: 'K', Queen: 'Q', Rook: 'R', Bishop: 'B', Knight: 'N', Pawn: 'P' };
        const colorNameToLetter = { White: 'w', Black: 'b' };
        if (!Array.isArray(dto) || dto.length !== 8) return null;
        return dto.map(row => row.map(cell => {
            if (!cell) return null;
            const t = cell.type ?? cell.Type ?? '';
            const c = cell.color ?? cell.Color ?? '';
            const moved = cell.hasMoved ?? cell.HasMoved ?? false;
            let typeLetter = null;
            if (typeof t === 'string') {
                if (t.length === 1) typeLetter = t.toUpperCase(); else typeLetter = typeNameToLetter[t] ?? null;
            } else if (typeof t === 'number') {
                // fallback numeric enums (not expected)
                const numMap = { 0: 'K', 1: 'Q', 2: 'R', 3: 'B', 4: 'N', 5: 'P' };
                typeLetter = numMap[t];
            }
            let colorLetter = null;
            if (typeof c === 'string') {
                if (c.length === 1) colorLetter = c.toLowerCase(); else colorLetter = colorNameToLetter[c] ?? null;
            } else if (typeof c === 'number') {
                colorLetter = c === 0 ? 'w' : 'b';
            }
            if (!typeLetter || !colorLetter) return null;
            return { type: typeLetter, color: colorLetter, hasMoved: !!moved };
        }));
    };

    // normalize currentPlayer from various possible response shapes
    const getCurrentPlayerFrom = (res) => {
        const v = res?.CurrentPlayer ?? res?.currentPlayer ?? res?.board?.CurrentPlayer ?? res?.board?.currentPlayer ?? res?.board?.currentplayer ?? null;
        if (!v) return null;
        const s = String(v).toLowerCase();
        if (s.startsWith('w')) return 'w';
        if (s.startsWith('b')) return 'b';
        return null;
    };

    useEffect(() => {
        (async () => {
            try {
                const list = await getSaves();
                console.log('getSaves response:', list);
                setSaves((list || []).map(normalizeSave));
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    // Auto-hide success messages after 3 seconds
    useEffect(() => {
        if (!message) return;
        if (messageType === 'success') {
            const t = setTimeout(() => {
                setMessage("");
                setMessageType('info');
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [message, messageType]);

    // load current board from server on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await getBoard();
                console.log('getBoard response raw:', res);
                // accept several shapes: { Board: { Squares: [...] } } or { board: { squares: [...] } } or direct array
                const boardArr = res?.Board?.Squares ?? res?.Board?.squares ?? res?.Board ?? res?.board?.Squares ?? res?.board?.squares ?? res?.board ?? res?.Squares ?? res?.squares ?? (Array.isArray(res) ? res : null);
                console.log('Computed boardArr for mapping:', boardArr);
                let mapped = null;
                try {
                    mapped = boardArr ? mapDtoToBoard(boardArr) : null;
                    console.log('Mapped board (primary):', mapped);
                } catch (e) {
                    console.error('mapDtoToBoard threw', e);
                }
                if (!mapped && res?.board && res.board.squares) {
                    try {
                        const tryArr = res.board.squares;
                        const tryMapped = mapDtoToBoard(tryArr);
                        console.log('Mapped using res.board.squares fallback:', tryMapped);
                        if (tryMapped) mapped = tryMapped;
                    } catch (e) { console.error('fallback mapping threw', e); }
                }
                // apply mapped board once and set current player from response
                if (mapped) {
                    setBoard(mapped);
                    console.log('Board set in App');
                } else {
                    console.warn('No mapped board found from response', res);
                }
                const cp = getCurrentPlayerFrom(res);
                if (cp) setCurrentPlayer(cp);
                setServerSynced(true);
            } catch (e) {
                // ignore
            }
        })();

        // SignalR connection for live updates
        // Connect directly to backend negotiate endpoint. If REACT_APP_BACKEND_URL
        // is explicitly provided use it (CRA dev server). Otherwise prefer the
        // page origin when the app is served from the backend (Visual Studio).
        const pageOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin.trim() : '';

        const envBackend = (process.env.REACT_APP_BACKEND_URL || '').trim();
        console.log('[SignalR] REACT_APP_BACKEND_URL:', JSON.stringify(envBackend), 'pageOrigin:', JSON.stringify(pageOrigin)); 
        const backendBase = envBackend || (pageOrigin && pageOrigin !== 'http://localhost:3000' ? pageOrigin : 'http://localhost:5267');
        let hubUrl = '';
        try {
            // Use the URL constructor to ensure no accidental spaces or malformed concat
            hubUrl = new URL('/chesshub', backendBase).toString();
        } catch (e) {
            hubUrl = backendBase.replace(/\/$/, '') + '/chesshub';
        }

        console.log('[SignalR] resolved backendBase:', JSON.stringify(backendBase), 'hubUrl:', hubUrl);

        // Use LongPolling transport to avoid WebSocket/proxy issues during testing
        const conn = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl, { transport: signalR.HttpTransportType.LongPolling })
            .configureLogging(signalR.LogLevel.Debug)
            .withAutomaticReconnect()
            .build();

        console.log('SignalR HubConnection built for', hubUrl);
        console.log('backendBase:', backendBase);

        const findBoardArray = (obj) => {
            if (!obj) return null;
            // direct arrays
            if (Array.isArray(obj) && obj.length === 8) return obj;
            // common locations
            if (obj.Board && (Array.isArray(obj.Board) || obj.Board.Squares || obj.Board.squares))
                return obj.Board.Squares ?? obj.Board.squares ?? obj.Board;
            if (obj.Squares || obj.squares) return obj.Squares ?? obj.squares;
            // search one level deep for an array of length 8
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (Array.isArray(v) && v.length === 8) return v;
                if (v && (v.Squares || v.squares)) return v.Squares ?? v.squares;
            }
            return null;
        };

        const handleBoardUpdated = (payload) => {
            console.log('[SignalR] BoardUpdated received at', new Date().toISOString(), payload);
            const boardArr = findBoardArray(payload);
            console.log('[SignalR] Board array extracted:', boardArr);
            const mapped = boardArr ? mapDtoToBoard(boardArr) : null;
            console.log('[SignalR] Mapped board from payload:', mapped);
            if (mapped) {
                // clone deeply to ensure React state change detection and avoid shared references
                const cloned = JSON.parse(JSON.stringify(mapped));
                setBoard(cloned);
                    // force remount of ChessBoard to avoid any internal-reference issues
                    setBoardKey(k => k + 1);
                // normalize current player from payload
                const cp = getCurrentPlayerFrom(payload) ?? (payload?.CurrentPlayer ?? null);
                if (cp === 'w' || cp === 'b') setCurrentPlayer(cp);
                // if payload contains captured info, use it to sync captured list
                if (payload?.Captured && typeof payload.Captured === 'object') {
                    try {
                        const cap = payload.Captured;
                        setCaptured({ w: normalizeCapturedList(cap.w || []), b: normalizeCapturedList(cap.b || []) });
                    } catch (e) { /* ignore */ }
                }
                setMessage('Board updated (live)');
                setMessageType('success');
                setSaveTrigger(t => t + 1);
                setServerSynced(true);
            } else {
                console.warn('BoardUpdated payload did not contain valid board array', payload);
            }
        };

        conn.on('BoardUpdated', handleBoardUpdated);
        conn.onreconnecting(err => {
            console.warn('SignalR reconnecting', err);
            setMessage('Reconnecting to server...');
        });
        conn.onreconnected(async (id) => {
            console.log('SignalR reconnected, new id:', id);
            setMessage('Reconnected');
            setMessageType('info');
            // after reconnect, resync authoritative board from server
            try {
                const srv = await getBoard();
                const boardArr = srv?.Board?.Squares ?? srv?.Board?.squares ?? srv?.board?.Squares ?? srv?.board?.squares ?? (Array.isArray(srv) ? srv : null);
                const mappedSrv = boardArr ? mapDtoToBoard(boardArr) : null;
                if (mappedSrv) {
                    setBoard(mappedSrv);
                    setBoardKey(k => k + 1);
                    const cp = srv?.CurrentPlayer ?? srv?.currentPlayer ?? null;
                    if (cp === 'w' || cp === 'b') setCurrentPlayer(cp);
                    setServerSynced(true);
                }
            } catch (e) {
                console.warn('Failed to resync after reconnect', e);
            }
        });
        conn.onclose(err => console.warn('SignalR connection closed', err));

        const startWithFallback = async (connection) => {
            try {
                console.log('[SignalR] starting connection...');
                await connection.start();
                console.log('[SignalR] connected using transport', connection.connectionState);
                return connection;
            } catch (err) {
                console.error('[SignalR] start failed, error:', err && err.message ? err.message : err);
                try {
                    const lp = new signalR.HubConnectionBuilder()
                        .withUrl(hubUrl, { transport: signalR.HttpTransportType.LongPolling })
                        .configureLogging(signalR.LogLevel.Debug)
                        .withAutomaticReconnect()
                        .build();
                    lp.on('BoardUpdated', handleBoardUpdated);
                    console.log('[SignalR] starting LongPolling fallback...');
                    await lp.start();
                    console.log('[SignalR] connected using LongPolling');
                    return lp;
                } catch (err2) {
                    console.error('[SignalR] fallback start failed', err2 && err2.message ? err2.message : err2);
                    return null;
                }
            }
        };

        let activeConn = null;
        (async () => { activeConn = await startWithFallback(conn); })();

        return () => {
            if (activeConn) activeConn.stop().catch(() => { });
            conn.off('BoardUpdated', handleBoardUpdated);
        };
    }, []);

    // expose serverSynced flag on window for ChessBoard to read (simple mechanism)
    useEffect(() => {
        try { window.__serverSynced = serverSynced; } catch { }
    }, [serverSynced]);

    return (
        <div style={{ padding: "20px", fontFamily: "Arial" }}>

            {/* INFO-ILMOITUKSET */}
            {message && (
                <div
                    style={{
                        background: messageType === 'success' ? 'rgba(0,128,0,0.75)' : 'rgba(255, 0, 0, 0.6)',
                        padding: "10px",
                        borderRadius: "5px",
                        color: "white",
                        fontWeight: "bold",
                        marginBottom: "10px",
                    }}
                >
                    {message}
                </div>
            )}

            {/* Vuoron highlight-teksti (above board) */}
            <div
                style={{
                    marginBottom: "15px",
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: currentPlayer === "w" ? "blue" : "darkred",
                }}
            >
                {currentPlayer === "w" ? "White to move" : "Black to move"}
            </div>

            {/* Main area: board + right column (save/load, captured alignment) */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <ChessBoard
                    board={board}
                    setBoard={setBoard}
                    currentPlayer={currentPlayer}
                    setCurrentPlayer={setCurrentPlayer}
                    setMessage={setMessage}
                    clearSelectionTrigger={saveTrigger}
                    key={boardKey}
                    captured={captured}
                    setCaptured={setCaptured}
                    addCaptured={addCaptured}
                />

                <div style={{ width: 320 }}>
                    <div style={{ padding: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, marginBottom: 12 }}>
                        <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Save name" style={{ width: '95%', marginBottom: 6 }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={async () => {
                                    try {
                                        const res = await saveGame(saveName || 'manual');
                                        setMessage(`Saved: ${res.id}`);
                                        setMessageType('success');
                                    const list = await getSaves();
                                    setSaves((list || []).map(normalizeSave));
                                    // notify board to clear any selection highlighting
                                    setSaveTrigger(t => t + 1);
                                // also write a sync marker to localStorage so other tabs update captured
                                try {
                                    localStorage.setItem('chess_sync', JSON.stringify({ ts: Date.now(), captured }));
                                    console.debug('[App] wrote chess_sync after save', captured);
                                } catch (e) { /* ignore */ }
                                // also notify other tabs to refresh saved games list
                                try {
                                    localStorage.setItem('chess_saves_sync', JSON.stringify({ ts: Date.now(), id: res.id }));
                                    console.debug('[App] wrote chess_saves_sync after save', res.id);
                                } catch (e) { /* ignore */ }
                                    } catch (e) {
                                        setMessage('Save failed');
                                        setMessageType('error');
                                    }
                            }}>Save</button>
                        </div>
                    </div>

                    <div style={{ padding: 8, background: 'rgba(255,255,255,0.9)', borderRadius: 6 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Saved games</div>
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                            {saves.length === 0 && <div style={{ fontSize: 12 }}>No saves</div>}
                            {saves.map(s => (
                                <div key={s.Id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <div style={{ fontSize: 12, wordBreak: 'break-all' }}>{(() => {
                                        // Format filename as: yyyy-mm-dd hh:mm_Name.json
                                        const raw = s.TimestampUtc ?? s.timestampUtc ?? s.Timestamp ?? s.timestamp ?? s.Time ?? s.time ?? '';
                                        const d = raw ? new Date(raw) : null;
                                        if (!d || isNaN(d.getTime())) return `${s.Name || 'save'}.json`;
                                        const pad = (n) => String(n).padStart(2, '0');
                                        const y = d.getFullYear();
                                        const m = pad(d.getMonth() + 1);
                                        const day = pad(d.getDate());
                                        const hh = pad(d.getHours());
                                        const mm = pad(d.getMinutes());
                                        const ss = pad(d.getSeconds());
                                        const namePart = (s.Name || 'save').replace(/[^a-zA-Z0-9\-_. ]/g, '').replace(/\s+/g, '_');
                                        return `${namePart}_${y}-${m}-${day} ${hh}:${mm}:${ss}`;
                                    })()}
                                        
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={async () => {
                                        try {
                                            const res = await loadGame(s.Id);
                                            console.log('loadGame response:', res);
                                            // apply captured from server regardless of board mapping success
                                            try {
                                                const cap = res?.Captured ?? res?.captured;
                                                console.debug('[App] load returned captured:', cap);
                                                if (cap && typeof cap === 'object') {
                                                    setCaptured({ w: normalizeCapturedList(cap.w || []), b: normalizeCapturedList(cap.b || []) });
                                                }
                                            } catch (e) { console.warn('Failed to apply captured from load early', e); }
                                            // robustly find board array inside response
                                            const findBoardArray = (obj) => {
                                                if (!obj) return null;
                                                if (Array.isArray(obj) && obj.length === 8) return obj;
                                                if (obj.Board) return obj.Board.Squares ?? obj.Board.squares ?? obj.Board;
                                                if (obj.board) return obj.board.Squares ?? obj.board.squares ?? obj.board;
                                                if (obj.Squares || obj.squares) return obj.Squares ?? obj.squares;
                                                for (const k of Object.keys(obj)) {
                                                    const v = obj[k];
                                                    if (Array.isArray(v) && v.length === 8) return v;
                                                    if (v && (v.Squares || v.squares)) return v.Squares ?? v.squares;
                                                }
                                                return null;
                                            };

                                            const boardArr = findBoardArray(res);
                                            const mapped = boardArr ? mapDtoToBoard(boardArr) : null;
                                            if (mapped) {
                                                // apply captured from server if present
                                                try {
                                                    const cap = res?.Captured ?? res?.captured;
                                                    if (cap && typeof cap === 'object') {
                                                        const w = (cap.w || []).map(p => ({ type: p.type, color: p.color, id: Date.now() + Math.random() }));
                                                        const b = (cap.b || []).map(p => ({ type: p.type, color: p.color, id: Date.now() + Math.random() }));
                                                        setCaptured({ w, b });
                                                    }
                                                } catch (e) { /* ignore */ }
                                                setBoard(mapped);
                                                setMessage('Loaded');
                                                setMessageType('success');
                                                setSaveTrigger(t => t + 1);
                                            } else {
                                                setMessage('Loaded data has unexpected shape; see console');
                                                setMessageType('error');
                                                console.log('Unexpected load payload:', res);
                                            }
                                        } catch (e) {
                                            console.error('Load failed', e);
                                            setMessage('Load failed');
                                            setMessageType('error');
                                        }
                                        }}>Load</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            
        </div>
    );
}

export default App;
