
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
        const pageOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
        const envBackend = process.env.REACT_APP_BACKEND_URL;
        const backendBase = envBackend || (pageOrigin && pageOrigin !== 'http://localhost:3000' ? pageOrigin : 'http://localhost:5267');
        const hubUrl = backendBase.replace(/\/$/, '') + '/chesshub';

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
                                            const dto = res?.Board?.Squares ?? res?.Squares ?? res?.squares ?? (Array.isArray(res) ? res : null);
                                            const mapped = dto ? mapDtoToBoard(dto) : null;
                                            if (mapped) {
                                                setBoard(mapped);
                                                setMessage('Loaded');
                                                setMessageType('success');
                                                // clear any selection highlighting in board
                                                setSaveTrigger(t => t + 1);
                                            } else if (Array.isArray(dto)) {
                                                // fallback: maybe backend already returned frontend-shaped board
                                                setBoard(dto);
                                                setMessage('Loaded (raw)');
                                                setMessageType('success');
                                                setSaveTrigger(t => t + 1);
                                            } else {
                                                // show debug info if unexpected shape
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
