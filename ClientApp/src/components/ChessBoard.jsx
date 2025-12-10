//toimiva AI versio
import React, { useState, useRef } from "react";
import Piece from "./Piece";
import pawnWFlying from "../assets/pieces/PawnW - Flying.png";
import pawnBFlying from "../assets/pieces/PawnB - Flying.png";

/**
 * ChessBoard component
 * Props:
 *  - board: 8x8 array (board[row][col]) where each square is either null or { type: "P"/"K"/..., color: "w"/"b" }
 *  - setBoard: function to update the board state (provided by App.jsx)
 */
export default function ChessBoard({ board, setBoard, currentPlayer, setCurrentPlayer, message, setMessage }) {
    const [selectedSquare, setSelectedSquare] = useState(null);        // { r, c } or null
    const [validMoves, setValidMoves] = useState([]);      // array of { r, c }    
    const [checkStatus, setCheckStatus] = useState({ w: false, b: false });
    const [gameOver, setGameOver] = useState(false);
    const messageTimeoutRef = useRef(null);
    const [captured, setCaptured] = useState({ w: [], b: [] });
    const [flying, setFlying] = useState([]); // { id, piece, left, top, tx, ty, size }
    const capturedRef = useRef(null);

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
    const eq = (a, b) => a?.r === b?.r && a?.c === b?.c;

    // Helper: check if a coordinate is inside board
    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

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
            newBoard[row][col] = newBoard[selectedSquare.row][selectedSquare.col];
            newBoard[selectedSquare.row][selectedSquare.col] = null;


            setBoard(newBoard);
            setSelectedSquare(null);
            setValidMoves([]);

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
                    // add flying element at start position
                    setFlying(prev => [...prev, { id, piece: targetPiece, left: startLeft, top: startTop, tx: 0, ty: 0, size }]);

                    // after render, calculate translation and trigger transition
                    requestAnimationFrame(() => {
                        const tx = destLeft - startLeft;
                        const ty = destTop - startTop;
                        setFlying(prev => prev.map(f => f.id === id ? { ...f, tx, ty } : f));

                        // after animation ends, remove flying and add to captured list
                        setTimeout(() => {
                            setFlying(prev => prev.filter(f => f.id !== id));
                            setCaptured(prev => ({ ...prev, [targetPiece.color]: [...prev[targetPiece.color], targetPiece] }));
                        }, 900); // match transition duration
                    });
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

            // Vaihda vuoro (jos peli ei p‰‰ttynyt)
            setCurrentPlayer(prev => (prev === "w" ? "b" : "w"));

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
        console.log("Getting king moves for piece:", piece);
        // normalize type value (accept 'K' or 'king')
        const typeStr = (piece.type || "").toString();
        const isKing =
            typeStr === "K" || typeStr.toLowerCase() === "king" || typeStr === "k";
        if (!isKing) return moves;
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
        for (const move of kingMoves) {
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
        console.log("King moves:", moves);
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
            {flying.map(f => (
                    <img
                    key={`fly-${f.id}`}
                    src={
                        f.piece && f.piece.type === 'P'
                            ? (f.piece.color === 'w' ? pawnWFlying : pawnBFlying)
                            : ''
                    }
                    alt=""
                    style={{
                        position: 'fixed',
                        left: f.left,
                        top: f.top,
                        width: f.size,
                        height: f.size,
                        transform: `translate(${f.tx}px, ${f.ty}px) rotate(0deg)`,
                        transition: 'transform 0.9s ease-in-out, opacity 0.9s ease-in-out',
                        opacity: 1,
                        pointerEvents: 'none',
                        zIndex: 9999
                    }}
                />
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
