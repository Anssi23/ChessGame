//toimiva AI versio
import React, { useState, useRef, useEffect } from "react";
import Piece from "./Piece";
import { pieceImages } from './Piece';
import { makeMove, getBoard } from '../api/gameApi';

// Local mapper (same logic as App.jsx) to convert server DTO -> frontend board
function mapDtoToBoardLocal(dto) {
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
}

// Helper to load flying image for a captured piece (e.g. "KingW - Flying.png")
function getFlyingSrc(piece) {
    if (!piece) return "";
    const typeMap = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
    const base = typeMap[piece.type] || piece.type;
    const colorLetter = (piece.color || 'w').toString().toUpperCase() === 'W' ? 'W' : 'B';
    const filename = `${base}${colorLetter} - Flying.png`;
    try {
        // dynamic require - webpack will include matching assets
        // eslint-disable-next-line global-require, import/no-dynamic-require
        return require(`../assets/pieces/${filename}`);
    } catch (e) {
        // fallback to regular piece image if flying image not found
        return pieceImages[piece.type] ? pieceImages[piece.type][piece.color] : '';
    }
}

/**
 * ChessBoard component
 * Props:
 *  - board: 8x8 array (board[row][col]) where each square is either null or { type: "P"/"K"/..., color: "w"/"b" }
 *  - setBoard: function to update the board state (provided by App.jsx)
 */
export default function ChessBoard({ board, setBoard, currentPlayer, setCurrentPlayer, message, setMessage, clearSelectionTrigger }) {
    const [selectedSquare, setSelectedSquare] = useState(null);        // { r, c } or null
    const [validMoves, setValidMoves] = useState([]);      // array of { r, c }    
    const [checkStatus, setCheckStatus] = useState({ w: false, b: false });
    const [gameOver, setGameOver] = useState(false);
    const [pendingMove, setPendingMove] = useState(false);
    const messageTimeoutRef = useRef(null);
    const [captured, setCaptured] = useState({ w: [], b: [] });
    const [flying, setFlying] = useState([]); // { id, piece, left, top, tx, ty, size }
    const capturedRef = useRef(null);
    const rafRef = useRef(null);

    // If parent did not provide board (null), try to load directly from server as fallback
    useEffect(() => {
        let mounted = true;
        (async () => {
            if (board && Array.isArray(board) && board.length === 8) return;
            try {
                const res = await getBoard();
                console.log('ChessBoard: getBoard raw:', res);
                const boardArr = res?.Board?.Squares ?? res?.Board?.squares ?? res?.Board ?? res?.board?.Squares ?? res?.board?.squares ?? res?.board ?? res?.Squares ?? res?.squares ?? (Array.isArray(res) ? res : null);
                const mapped = boardArr ? mapDtoToBoardLocal(boardArr) : null;
                if (mounted && mapped) {
                    setBoard(mapped);
                    const cp = res?.CurrentPlayer ?? res?.currentPlayer ?? res?.currentplayer ?? null;
                    if (cp === 'w' || cp === 'b') setCurrentPlayer(cp);
                }
            } catch (e) {
                console.warn('ChessBoard: failed to load board from server', e);
            }
        })();
        return () => { mounted = false; };
    }, []);

    // Clear selection when parent signals a save happened
    useEffect(() => {
        if (clearSelectionTrigger == null) return;
        setSelectedSquare(null);
        setValidMoves([]);
    }, [clearSelectionTrigger]);

    // When parent-provided `board` prop changes (e.g., SignalR update), clear pending move
    // and any transient selection to avoid client-side desync.
    useEffect(() => {
        console.log('[ChessBoard] parent board prop changed');
        // if a server update arrived, stop blocking interactions and clear selection
        setPendingMove(false);
        setSelectedSquare(null);
        setValidMoves([]);
    }, [board]);

    // Clear transient animations/captured UI when authoritative board arrives
    useEffect(() => {
        // remove any flying animations and reset captured lists to match server
        setFlying([]);
        setCaptured({ w: [], b: [] });
    }, [board]);

    // Animation step using sine-wave path. Runs via requestAnimationFrame while there are flying items.
    const stepFlying = () => {
        setFlying(prev => {
            const now = performance.now();
            const next = [];
            const toAdd = { w: [], b: [] };

            for (const f of prev) {
                const elapsed = Math.max(0, now - (f.startTime || 0));
                const t = Math.min(1, elapsed / (f.duration || 1900));
                const x = (f.startLeft || f.left) + ((f.destLeft || (f.left + (f.tx || 0))) - (f.startLeft || f.left)) * t;
                const baseY = (f.startTop || f.top) + ((f.destTop || (f.top + (f.ty || 0))) - (f.startTop || f.top)) * t;
                const amp = f.amplitude || 20;
                const freq = f.frequency || 2; // cycles
                const y = baseY + amp * Math.sin(t * 2 * Math.PI * freq);

                if (t >= 1) {
                    // animation finished -> collect captured
                    if (f.piece && f.piece.color) {
                        toAdd[f.piece.color] = toAdd[f.piece.color] || [];
                        toAdd[f.piece.color].push(f.piece);
                    }
                } else {
                    next.push({ ...f, currentLeft: x, currentTop: y });
                }
            }

            // add captured pieces accumulated
            const hasAdds = (toAdd.w && toAdd.w.length) || (toAdd.b && toAdd.b.length);
            if (hasAdds) {
                setCaptured(prevC => ({
                    w: [...prevC.w, ...(toAdd.w || [])],
                    b: [...prevC.b, ...(toAdd.b || [])]
                }));
            }

            // schedule next frame if still flying
            if (next.length > 0) {
                rafRef.current = requestAnimationFrame(stepFlying);
            } else {
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                }
            }

            return next;
        });
    };

    const showTemporaryMessage = (msg, ms = 3000) => {
        if (messageTimeoutRef.current) {
            clearTimeout(messageTimeoutRef.current);
            messageTimeoutRef.current = null;
        }
        setMessage(msg);
        messageTimeoutRef.current = setTimeout(() => {
            setMessage("");
            messageTimeoutRef.current = null;
        }, ms);
    };

    // Safety: ensure board is present and 8x8
    if (!board || !Array.isArray(board) || board.length !== 8) {
        return <div>Ladataan pelilautaa...</div>;
    }

    // Helper: check if two squares are equal
    //const eq = (a, b) => a?.r === b?.r && a?.c === b?.c;

    // Helper: check if a coordinate is inside board
    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

    // Check if a square (r,c) is attacked by any piece of color `byColor`
    const isSquareAttacked = (board, r, c, byColor) => {
        // iterate all pieces of byColor and see if any has a move to r,c
        for (let rr = 0; rr < 8; rr++) {
            for (let cc = 0; cc < 8; cc++) {
                const p = board[rr][cc];
                if (!p || p.color !== byColor) continue;
                const t = (p.type || "").toString();
                let moves = [];
                switch (t) {
                    case "P":
                        moves = getPawnMoves(board, rr, cc, p);
                        break;
                    case "N":
                        moves = getKnightMoves(board, rr, cc, p);
                        break;
                    case "B":
                        moves = getBishopMoves(board, rr, cc, p);
                        break;
                    case "R":
                        moves = getRookMoves(board, rr, cc, p);
                        break;
                    case "Q":
                        moves = getQueenMoves(board, rr, cc, p);
                        break;
                    case "K":
                        // king attacks adjacent squares only
                        moves = [];
                        const kingD = [
                            { dr: -1, dc: -1 },{ dr: -1, dc: 0 },{ dr: -1, dc: 1 },
                            { dr: 0, dc: -1 },{ dr: 0, dc: 1 },
                            { dr: 1, dc: -1 },{ dr: 1, dc: 0 },{ dr: 1, dc: 1 }
                        ];
                        for (const d of kingD) {
                            const nr = rr + d.dr, nc = cc + d.dc;
                            if (inBounds(nr, nc)) moves.push({ r: nr, c: nc });
                        }
                        break;
                    default:
                        moves = [];
                }
                if (moves.some(m => m.r === r && m.c === c)) return true;
            }
        }
        return false;
    };

    // returns true if given square {r,c} is in validMoves
    const isValidSquare = (r, c) =>
        validMoves.some((m) => m.r === r && m.c === c);

    const wouldKingBeInCheckAfterMove = (board, from, to) => {
        // Kopioi lauta
        const testBoard = board.map(row => row.slice());

        // Tee siirto testilaudalle
        testBoard[to.row][to.col] = testBoard[from.row][from.col];
        testBoard[from.row][from.col] = null;
                
        // Kenen siirto?
        const movedPiece = board[from.row][from.col];
        if (!movedPiece) return false;

        return isKingInCheck(testBoard, movedPiece.color);
    };

    // Click handling:
    // - If no selected piece: select piece and compute valid moves
    // - If selected and click is in validMoves: perform move
    // - If selected and click on another own piece: change selection
    // - Else: clear selection
    function handleSquareClick(row, col) {
        // If game is over, ignore clicks
        if (gameOver) return;
        // If a move is pending server confirmation, ignore further clicks
        if (pendingMove) return;
        // If client hasn't yet synced with server initial board, ignore clicks
        // (prevents mismatches between initialBoard and server board)
        // serverSynced prop is provided by App.jsx
        if (typeof window !== 'undefined' && window.__serverSynced === false) return;
        const clickedPiece = board[row][col];

        // Jos ei ole valittua ruutua, saa klikata vain oman v‰rin nappulaa
        if (!selectedSquare) {
            if (clickedPiece && clickedPiece.color === currentPlayer) {
                const moves = getValidMoves(board, row, col);
                setSelectedSquare({ row, col });
                setValidMoves(moves);
            }
            return;
        }

        // No selection yet
        if (!selectedSquare) {
            if (!clickedPiece) return; // clicking empty square does nothing
            const moves = getValidMoves(board, row, col);
            setSelectedSquare({ row, col });
            setValidMoves(moves);
            return;
        }

        // Click same square -> deselect
        if (selectedSquare.row === row && selectedSquare.col === col) {
            setSelectedSquare(null);
            setValidMoves([]);
            return;
        }


        if (clickedPiece && clickedPiece.color === board[selectedSquare.row][selectedSquare.col].color) {
            console.log(`Changing selection to (${row},${col})`);
            const moves = getValidMoves(board, row, col);
            setSelectedSquare({ row, col });
            setValidMoves(moves);
            return;
        }


        // If clicked square is a valid move -> perform move
        if (isValidSquare(row, col)) {
            console.log(`Moving piece from (${selectedSquare.row},${selectedSquare.col}) to (${row},${col})`);

            // 1. Estet‰‰n siirrot jotka j‰tt‰v‰t kuninkaan uhattuun asemaan
            const moveLeavesKingInCheck = wouldKingBeInCheckAfterMove(
                board,
                selectedSquare,
                { row, col }
            );


            if (moveLeavesKingInCheck) {
                showTemporaryMessage("Illegal move - king would be in check!", 3000);
                setSelectedSquare(null);
                setValidMoves([]);
                return; // Siirto estetty!
            }

            // 2. Suorita siirto
            const newBoard = board.map((rowArr) => rowArr.slice()); // shallow copy rows
            // If target has a piece, animate capture before adding to captured list
            const targetPiece = newBoard[row][col];

            // perform move on board regardless of animation
            const movingPiece = newBoard[selectedSquare.row][selectedSquare.col];
            // ensure piece still exists and belongs to current player
            if (!movingPiece) {
                showTemporaryMessage('Piece not present on server-synced board. Refresh to sync.');
                return;
            }
            if (movingPiece.color !== currentPlayer) {
                showTemporaryMessage('Not your piece to move.');
                return;
            }
            // mark moved pieces (avoid mutating original by cloning)
            newBoard[row][col] = { ...(movingPiece || {}), hasMoved: true };
            newBoard[selectedSquare.row][selectedSquare.col] = null;

            // Handle castling: if king moved two columns, also move the rook
            if (movingPiece && (movingPiece.type === "K" || movingPiece.type === "k") && Math.abs(col - selectedSquare.col) === 2) {
                const r = selectedSquare.row;
                // king-side
                if (col === 6) {
                    // rook from col 7 -> col 5
                    const rook = newBoard[r][7];
                    if (rook) {
                        newBoard[r][5] = { ...rook, hasMoved: true };
                        newBoard[r][7] = null;
                    }
                }
                // queen-side
                if (col === 2) {
                    // rook from col 0 -> col 3
                    const rook = newBoard[r][0];
                    if (rook) {
                        newBoard[r][3] = { ...rook, hasMoved: true };
                        newBoard[r][0] = null;
                    }
                }
            }


            // persist local coordinates for backend call
            const fromRow = selectedSquare.row;
            const fromCol = selectedSquare.col;

            const prevBoard = board.map(r => r.slice());
            // Do not apply optimistic board update. Mark move as pending and send to server.
            setPendingMove(true);

            // Send move to backend to keep server-side board in sync and update client from server
            // Do not preflight with getBoard() here to avoid race with SignalR broadcasts.
            (async () => {
                try {
                    const apiRes = await makeMove({ FromRow: fromRow, FromCol: fromCol, ToRow: row, ToCol: col });
                    try {
                        if (!apiRes) {
                            showTemporaryMessage('No response from server');
                            return;
                        }
                        // makeMove returns { ok, status, body }
                        const body = apiRes.body ?? apiRes;
                        if (!apiRes.ok) {
                            const errMsg = body?.error ?? `Move rejected (${apiRes.status})`;
                            showTemporaryMessage(errMsg, 4000);
                            // try resync if server included board state in body
                            const errBoardArr = body?.Board?.Squares ?? body?.Board?.squares ?? body?.Board ?? body?.Squares ?? body?.squares ?? (Array.isArray(body) ? body : null);
                            const errMapped = errBoardArr ? mapDtoToBoardLocal(errBoardArr) : null;
                            if (errMapped) setBoard(errMapped);
                            return;
                        }

                        const boardArr = body?.Board?.Squares ?? body?.Board?.squares ?? body?.Board ?? body?.Squares ?? body?.squares ?? (Array.isArray(body) ? body : null);
                        if (boardArr && Array.isArray(boardArr) && boardArr.length === 8) {
                            const mapped = mapDtoToBoardLocal(boardArr);
                            if (mapped) setBoard(mapped);
                        }

                        const cp = body?.CurrentPlayer ?? body?.currentPlayer ?? null;
                        if (cp === 'w' || cp === 'b') setCurrentPlayer(cp);
                    } finally {
                        // always clear pendingMove after server responded
                        setPendingMove(false);
                    }
                } catch (err) {
                    console.error('Failed to send move to server', err);
                    showTemporaryMessage('Failed to persist move to server');
                }
            })();

            // If there was a captured piece, start flying animation then add to captured
            if (targetPiece) {
                try {
                    // source element
                    const cellEl = document.querySelector(`[data-square="${row}-${col}"]`);
                    const srcRect = cellEl ? cellEl.getBoundingClientRect() : null;
                    const destRect = capturedRef.current ? capturedRef.current.getBoundingClientRect() : null;
                    const index = captured[targetPiece.color].length;
                    const size = 30;
                    const startLeft = srcRect ? srcRect.left + window.scrollX : 0;
                    const startTop = srcRect ? srcRect.top + window.scrollY : 0;
                    // place destination slightly offset inside captured area
                    const destLeft = destRect ? destRect.left + window.scrollX + 8 : startLeft;
                    const destTop = destRect ? destRect.top + window.scrollY + 24 + index * (size + 6) : startTop;

                    const id = Date.now() + Math.random();
                    const duration = 1900; // ms
                    const amplitude = 24; // px (slightly larger)
                    const frequency = 2; // cycles
                    const sLeft = startLeft;
                    const sTop = startTop;
                    const destLeftFinal = destLeft;
                    const destTopFinal = destTop;
                    const startTime = performance.now();

                    // add flying element with params
                    setFlying(prev => [...prev, {
                        id,
                        piece: targetPiece,
                        left: sLeft,
                        top: sTop,
                        startLeft: sLeft,
                        startTop: sTop,
                        destLeft: destLeftFinal,
                        destTop: destTopFinal,
                        duration,
                        amplitude,
                        frequency,
                        size,
                        startTime
                    }]);

                    // start RAF loop if not already running
                    if (!rafRef.current) {
                        rafRef.current = requestAnimationFrame(stepFlying);
                    }
                } catch (e) {
                    // fallback: if anything fails, just add to captured
                    setCaptured(prev => ({ ...prev, [targetPiece.color]: [...prev[targetPiece.color], targetPiece] }));
                }
            }

            // P‰ivit‰ check-tilanne siirron j‰lkeen
            setCheckStatus({
                w: isKingInCheck(newBoard, "w"),
                b: isKingInCheck(newBoard, "b")
            });

            // Tarkista, onko vastustaja shakissa tai mattitilassa
            const opponent = currentPlayer === "w" ? "b" : "w";
            const opponentInCheck = isKingInCheck(newBoard, opponent);
            const opponentInCheckmate = isCheckmate(newBoard, opponent);

            // Muodosta luettava v‰ri-teksti vastustajalle
            const opponentName = (opponent === "w" || opponent === "white") ? "White" : "Black";

            if (opponentInCheckmate) {
                // Persistent checkmate message - clear any pending temporary message timeout first
                if (messageTimeoutRef.current) {
                    clearTimeout(messageTimeoutRef.current);
                    messageTimeoutRef.current = null;
                }
                setMessage(`Checkmate! ${currentPlayer === "w" ? "White" : "Black"} wins!`);
                setGameOver(true);
                return; // peli p‰‰ttynyt, ‰l‰ vaihda vuoroa
            }

            if (opponentInCheck) {
                // Temporary check message unless game over
                if (!gameOver) showTemporaryMessage(`CHECK on ${opponentName} king!`, 3000);
            } else {
                if (!gameOver) setMessage("");
            }

            // Do not locally toggle current player here; server is authoritative and will
            // send the updated current player in the move response or via SignalR.

            return;
        }

        // Otherwise clicked an invalid target -> just clear selection
        setSelectedSquare(null);
        setValidMoves([]);
    }
       

    //alkuper‰inen isKingInCheck
    const isKingInCheck = (board, color) => {
        let kingPos = null;
        // Find king position
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type === "K" && piece.color === color) {
                    kingPos = { r, c };
                    break;
                }
            }
            if (kingPos) break;
        }
        if (!kingPos) return false; // King not found (should not happen)

        // Check if any enemy piece can move to king's position
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.color !== color) {
                    const moves = getValidMoves(board, r, c);
                    if (moves.some((m) => m.r === kingPos.r && m.c === kingPos.c)) {
                        const colorName = (color === "w" || color === "white") ? "White" : "Black";
                        // Only show temporary message if game is not over. If gameOver, keep message persistent and clear any pending timeout.
                        if (!gameOver) {
                            showTemporaryMessage(`CHECK on ${colorName} king!`);
                        } else {
                            if (messageTimeoutRef.current) {
                                clearTimeout(messageTimeoutRef.current);
                                messageTimeoutRef.current = null;
                            }
                            setMessage(`CHECK on ${colorName} king!`);
                        }
                        return true; // King is in check
                    }
                }
            }
        }
        return false; // No threats found
    }

    function isCheckmate(board, kingColor) {
        // Jos ei check, ei checkmate
        if (!isKingInCheck(board, kingColor)) return false;

        // K‰yd‰‰n l‰pi jokainen oman v‰rin nappula
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {

                const piece = board[r][c];
                if (!piece || piece.color !== kingColor) continue;

                const moves = getValidMoves(board, r, c);


                for (let move of moves) {
                    // Simuloidaan siirto
                    //const copy = board.map(row => row.slice());
                    const copy = JSON.parse(JSON.stringify(board));

                    //if (!copy[r] || !copy[r][c]) {
                    //    console.error("Invalid source:", r, c, copy);
                    //}
                    //if (!copy[move.r]) {
                    //    console.error("Invalid destination row:", move.r);
                    //}


                    copy[move.r][move.c] = copy[r][c];
                    copy[r][c] = null;

                    // Jos t‰m‰n j‰lkeen ei ole check
                    if (!isKingInCheck(copy, kingColor)) {
                        return false; // yh‰ puolustuskeinoja -> ei mate
                    }
                }
            }
        }

        // Ei ainuttakaan pelastavaa siirtoa
        return true;
    }

        
    function getQueenMoves(board, row, col, piece) {

        const moves = [];
        if (!piece) return moves;
        console.log("Getting queen moves for piece:", piece);
        // normalize type value (accept 'Q' or 'queen')
        const typeStr = (piece.type || "").toString();
        const isQueen =
            typeStr === "Q" || typeStr.toLowerCase() === "queen" || typeStr === "q";
        if (!isQueen) return moves;

        // Combine rook and bishop directions
        const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
            { dr: -1, dc: -1 },
            { dr: -1, dc: 1 },
            { dr: 1, dc: -1 },
            { dr: 1, dc: 1 },
        ];

        for (const dir of directions) {
            let newR = row + dir.dr;
            let newC = col + dir.dc;
            while (inBounds(newR, newC)) {
                const targetPiece = board[newR][newC];
                if (!targetPiece) {
                    // Empty square
                    moves.push({ r: newR, c: newC });
                } else {
                    // Occupied square
                    if (targetPiece.color !== piece.color) {
                        // Enemy piece - can capture
                        moves.push({ r: newR, c: newC });
                    }
                    // Stop searching in this direction
                    break;
                }
                newR += dir.dr;
                newC += dir.dc;
            }
        }
        console.log("Queen moves:", moves);
        return moves;
    }


    // --- Rook movement logic (supports 'R' or 'rook' types) ---
    function getRookMoves(board, row, col, piece) {

        const moves = [];

        if (!piece) return moves;

        console.log("Getting rook moves for piece:", piece);
        // normalize type value (accept 'R' or 'rook')

        const typeStr = (piece.type || "").toString();

        const isRook =
            typeStr === "R" || typeStr.toLowerCase() === "rook" || typeStr === "r";
        if (!isRook) return moves;

        const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
        ];

        for (const dir of directions) {
            let newR = row + dir.dr;
            let newC = col + dir.dc;
            while (inBounds(newR, newC)) {
                const targetPiece = board[newR][newC];
                if (!targetPiece) {
                    // Empty square
                    moves.push({ r: newR, c: newC });
                } else {
                    // Occupied square
                    if (targetPiece.color !== piece.color) {
                        // Enemy piece - can capture
                        moves.push({ r: newR, c: newC });
                    }
                    // Stop searching in this direction
                    break;
                }
                newR += dir.dr;
                newC += dir.dc;
            }

        }
        return moves;
    }

 
    
    // --- Bishop movement logic (supports 'B' or 'bishop' types) ---
    function getBishopMoves(board, row, col, piece) {

        const moves = [];
        if (!piece) return moves;
        console.log("Getting bishop moves for piece:", piece);
        // normalize type value (accept 'B' or 'bishop')
        const typeStr = (piece.type || "").toString();
        const isBishop =
            typeStr === "B" || typeStr.toLowerCase() === "bishop" || typeStr === "b";

        if (!isBishop) return moves;

        const directions = [
            { dr: -1, dc: -1 },
            { dr: -1, dc: 1 },
            { dr: 1, dc: -1 },
            { dr: 1, dc: 1 },
        ];

        for (const dir of directions) {
            let newR = row + dir.dr;
            let newC = col + dir.dc;
            while (inBounds(newR, newC)) {
                const targetPiece = board[newR][newC];
                if (!targetPiece) {
                    // Empty square
                    moves.push({ r: newR, c: newC });
                } else {
                    // Occupied square
                    if (targetPiece.color !== piece.color) {
                        // Enemy piece - can capture
                        moves.push({ r: newR, c: newC });
                    }
                    // Stop searching in this direction
                    break;
                }
                newR += dir.dr;
                newC += dir.dc;
            }
        }
        return moves;
             
    }

    // --- King movement logic (supports 'K' or 'king' types) ---
    function getKingMoves(board, row, col, piece) {
        
        const moves = [];
        if (!piece) return moves;
        // basic king moves
        const kingMoves = [
            { dr: -1, dc: -1 },
            { dr: -1, dc: 0 },
            { dr: -1, dc: 1 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
            { dr: 1, dc: -1 },
            { dr: 1, dc: 0 },
            { dr: 1, dc: 1 },
        ];
        for (const m of kingMoves) {
            const nr = row + m.dr;
            const nc = col + m.dc;
            if (!inBounds(nr, nc)) continue;
            const tp = board[nr][nc];
            if (!tp || tp.color !== piece.color) moves.push({ r: nr, c: nc });
        }

        // Castling: only if king hasn't moved and not currently in check
        const opponent = piece.color === 'w' ? 'b' : 'w';
        if (!piece.hasMoved && !isSquareAttacked(board, row, col, opponent)) {
            // king-side: rook at col 7
            const rookK = board[row][7];
            if (rookK && rookK.type === 'R' && rookK.color === piece.color && !rookK.hasMoved) {
                // squares between king and rook must be empty: col+1 and col+2
                if (!board[row][5] && !board[row][6]) {
                    // squares king passes through (col+1 and col+2) must not be attacked
                    if (!isSquareAttacked(board, row, 5, opponent) && !isSquareAttacked(board, row, 6, opponent)) {
                        moves.push({ r: row, c: 6, castle: 'king' });
                    }
                }
            }

            // queen-side: rook at col 0
            const rookQ = board[row][0];
            if (rookQ && rookQ.type === 'R' && rookQ.color === piece.color && !rookQ.hasMoved) {
                // squares between king and rook: col-1, col-2, col-3 must be empty (we require col-1 and col-2 and col-3)
                if (!board[row][1] && !board[row][2] && !board[row][3]) {
                    // squares the king passes through: col-1 (3) and col-2 (2) must not be attacked
                    if (!isSquareAttacked(board, row, 3, opponent) && !isSquareAttacked(board, row, 2, opponent)) {
                        moves.push({ r: row, c: 2, castle: 'queen' });
                    }
                }
            }
        }

        return moves;
    }

    function getKnightMoves(board, row, col, piece) {
        const moves = [];
        if (!piece) return moves;

        console.log("Getting knight moves for piece:", piece);

        // normalize type value (accept 'N' or 'knight')
        const typeStr = (piece.type || "").toString();
        const isKnight =
            typeStr === "N" || typeStr.toLowerCase() === "knight" || typeStr === "n";
        if (!isKnight) return moves;
        const knightMoves = [
            { dr: -2, dc: -1 },
            { dr: -2, dc: 1 },
            { dr: -1, dc: -2 },
            { dr: -1, dc: 2 },
            { dr: 1, dc: -2 },
            { dr: 1, dc: 2 },
            { dr: 2, dc: -1 },
            { dr: 2, dc: 1 },
        ];
        for (const move of knightMoves) {
            const newR = row + move.dr;
            const newC = col + move.dc;
            if (inBounds(newR, newC)) {
                const targetPiece = board[newR][newC];
                // Can move if empty or occupied by enemy piece
                if (!targetPiece || targetPiece.color !== piece.color) {
                    moves.push({ r: newR, c: newC });
                }
            }
        }
        return moves;
    }   


    // --- Pawn movement logic (supports 'P' or 'pawn' types and color 'w'/'b') ---
    function getPawnMoves(board, row, col, piece) {
        const moves = [];
        if (!piece) return moves;

        console.log("Getting pawn moves for piece:", piece);

        // normalize type value (accept 'P' or 'pawn')
        const typeStr = (piece.type || "").toString();
        const isPawn =
            typeStr === "P" || typeStr.toLowerCase() === "pawn" || typeStr === "p";
        if (!isPawn) return moves;

        // color: accept 'w' or 'b' (or 'white'/'black' defensively)
        const color = (piece.color || "").toString().toLowerCase();
        const direction = color === "w" || color === "white" ? -1 : 1;
        const startRow = color === "w" || color === "white" ? 6 : 1;

        const oneR = row + direction;
        const twoR = row + 2 * direction;

        // 1 step forward if empty
        if (inBounds(oneR, col) && !board[oneR][col]) {
            moves.push({ r: oneR, c: col });

            // 2 steps from starting row (both squares must be empty)
            if (
                row === startRow &&
                inBounds(twoR, col) &&
                !board[twoR][col]
            ) {
                moves.push({ r: twoR, c: col });
            }
        }

        // captures: diag left / right if enemy piece present
        const leftC = col - 1;
        const rightC = col + 1;
        if (inBounds(oneR, leftC) && board[oneR][leftC] && board[oneR][leftC].color !== piece.color) {
            moves.push({ r: oneR, c: leftC });
        }
        if (inBounds(oneR, rightC) && board[oneR][rightC] && board[oneR][rightC].color !== piece.color) {
            moves.push({ r: oneR, c: rightC });
        }

        // NOTE: en passant, promootio ja muut erikoistapaukset lis‰t‰‰n myˆhemmin
        return moves;
    }

    

    // Dispatcher for piece type -> valid moves (start with pawn only)
    function getValidMoves(board, row, col) {
        const piece = board[row][col];
              
        if (!piece) return [];

        const type = (piece.type || "").toString();
               
        //return moves;
        switch (type) {
            //case "pawn":
            case "P"://Pawn
                return getPawnMoves(board, row, col, piece);
            case "N"://Knight
                return getKnightMoves(board, row, col, piece);
            case "K"://King
                return getKingMoves(board, row, col, piece);
            case "B"://Bishop
                return getBishopMoves(board, row, col, piece);
            case "R"://Rook
                return getRookMoves(board, row, col, piece);
            case "Q"://Queen
                return getQueenMoves(board, row, col, piece);
            default:
                return [];
        }
    }



    return (
        <div style={{ display: 'flex', gap: 12 }}>
            {/* Main board on the left */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(8, 60px)",
                    gridTemplateRows: "repeat(8, 60px)",
                    border: "2px solid black",
                }}
            >
                {board.map((rowArr, r) =>
                    rowArr.map((square, c) => {
                        const isSelected = selectedSquare && selectedSquare.row === r && selectedSquare.col === c;
                        const isValid = isValidSquare(r, c);

                        // determine background: selection highlight overrides normal colors
                        let bg;
                        if (isSelected) {
                            bg = 'rgba(255, 255, 0, 0.6)';
                        } else if (board[r][c] && board[r][c].type === "K" && checkStatus[board[r][c].color]) {
                            bg = 'red';
                        } else {
                            bg = (r + c) % 2 === 0 ? "#f0d9b5" : "#b58863";
                        }

                        return (
                            <div
                                key={`${r}-${c}`}
                                data-square={`${r}-${c}`}
                                className="board"
                                onClick={() => handleSquareClick(r, c)}
                                style={{
                                    width: "60px",
                                    height: "60px",
                                    background: bg,
                                    boxSizing: "border-box",
                                    border: isSelected ? "3px solid yellow" : isValid ? "solid rgba(0,200,0,0.9)" : "1px solid transparent",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    cursor: square ? "pointer" : "default",
                                }}
                            >
                                <Piece piece={square} />
                            </div>
                        );
                    })
                )}
            </div>

            {/* Flying captured pieces overlay */}
            {/* Flying elements rendered and positioned by RAF sine-wave logic (no flap animations) */}
            {flying.map(f => (
                <div
                    key={`fly-${f.id}`}
                    style={{
                        position: 'fixed',
                        left: f.currentLeft ?? f.left,
                        top: f.currentTop ?? f.top,
                        width: f.size,
                        height: f.size,
                        pointerEvents: 'none',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'translate(0,0)'
                    }}
                >
                    <img
                        src={getFlyingSrc(f.piece)}
                        alt=""
                        style={{
                            width: f.size,
                            height: f.size,
                            transformOrigin: '50% 50%'
                        }}
                    />
                </div>
            ))}

            {/* Captured pieces column on the right */}
            <div style={{ width: 160 }} ref={capturedRef}>
                <div style={{ marginBottom: 12 }}>
                    <strong>Captured</strong>
                </div>
                <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>White</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {captured.w.map((p, i) => (
                            <Piece key={`capt-w-${i}`} piece={p} size={30} />
                        ))}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 12, marginBottom: 6 }}>Black</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {captured.b.map((p, i) => (
                            <Piece key={`capt-b-${i}`} piece={p} size={30} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
