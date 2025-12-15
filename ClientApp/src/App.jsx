
import React, { useState, useEffect } from "react";
import ChessBoard from "./components/ChessBoard";
import initialBoard from "./initialBoard";
import { saveGame, getSaves, loadGame, getBoard } from './api/gameApi';


function App() {
    const [board, setBoard] = useState(initialBoard);
    const [currentPlayer, setCurrentPlayer] = useState("w");
    const [message, setMessage] = useState("");
    const [saveName, setSaveName] = useState("");
    const [messageType, setMessageType] = useState("info"); // "info" | "error" | "success"]
    const [saves, setSaves] = useState([]);
    const [saveTrigger, setSaveTrigger] = useState(0);

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
                const dto = res?.Squares ?? res?.squares ?? (Array.isArray(res) ? res : null);
                const mapped = dto ? mapDtoToBoard(dto) : null;
                if (mapped) setBoard(mapped);
            } catch (e) {
                // ignore
            }
        })();
    }, []);

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
