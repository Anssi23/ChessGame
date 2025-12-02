//toimiva AI versio
import React, { useState } from "react";
import Piece from "./Piece";

/**
 * ChessBoard component
 * Props:
 *  - board: 8x8 array (board[row][col]) where each square is either null or { type: "P"/"K"/..., color: "w"/"b" }
 *  - setBoard: function to update the board state (provided by App.jsx)
 */
export default function ChessBoard({ board, setBoard }) {
    const [selected, setSelected] = useState(null);        // { r, c } or null
    const [validMoves, setValidMoves] = useState([]);      // array of { r, c }

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

        // NOTE: en passant, promootio ja muut erikoistapaukset lisätään myöhemmin
        return moves;
    }

    // Click handling:
    // - If no selected piece: select piece and compute valid moves
    // - If selected and click is in validMoves: perform move
    // - If selected and click on another own piece: change selection
    // - Else: clear selection
    function handleClick(row, col) {
        const clickedPiece = board[row][col];

        // No selection yet
        if (!selected) {
            if (!clickedPiece) return; // clicking empty square does nothing
            const moves = getValidMoves(board, row, col);
            setSelected({ row, col });
            setValidMoves(moves);
            return;
        }

        // Click same square -> deselect
        if (selected.row === row && selected.col === col) {
            setSelected(null);
            setValidMoves([]);
            return;
        }

        // If clicked is a friendly piece -> change selection to that piece
        if (clickedPiece && clickedPiece.color === board[selected.row][selected.col].color) {
            console.log(`Changing selection to (${row},${col})`);
            const moves = getValidMoves(board, row, col);
            setSelected({ row, col });
            setValidMoves(moves);
            return;
        }

        // If clicked square is a valid move -> perform move
        if (isValidSquare(row, col)) {
            console.log(`Moving piece from (${selected.row},${selected.col}) to (${row},${col})`);
            const newBoard = board.map((rowArr) => rowArr.slice()); // shallow copy rows
            newBoard[row][col] = newBoard[selected.row][selected.col];
            newBoard[selected.row][selected.col] = null;
            setBoard(newBoard);
            setSelected(null);
            setValidMoves([]);
            return;
        }

        // Otherwise clicked an invalid target -> just clear selection
        setSelected(null);
        setValidMoves([]);
    }

    // Dispatcher for piece type -> valid moves (start with pawn only)
    function getValidMoves(board, row, col) {
        const piece = board[row][col];

        console.assert(piece, `getValidMoves called on empty square (${row},${col})`);

        if (!piece) return [];

        const type = (piece.type || "").toString();

        switch (type) {
            //case "pawn":
            case "P"://Pawn
                return getPawnMoves(board, row, col, piece);
            case "N"://Knight
                return getKnightMoves(board, row, col, piece);
            default:
                return [];
        }
    }



    return (
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
                    const isSelected = selected && selected.r === r && selected.c === c;
                    const isValid = isValidSquare(r, c);

                    return (
                        <div
                            key={`${r}-${c}`}
                            onClick={() => handleClick(r, c)}
                            style={{
                                width: "60px",
                                height: "60px",
                                background: (r + c) % 2 === 0 ? "#f0d9b5" : "#b58863",
                                boxSizing: "border-box",
                                border: isSelected ? "3px solid yellow" : isValid ? "3px solid rgba(0,200,0,0.9)" : "1px solid transparent",
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
    );
}
