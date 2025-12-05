import React from "react";
import "./Piece.css";
import whiteKing from '../assets/pieces/KingW.png';
import blackKing from '../assets/pieces/KingB.png';
import whiteQueen from '../assets/pieces/QueenW.png';
import blackQueen from '../assets/pieces/QueenB.png';
import whiteKnight from '../assets/pieces/KnightW.png';
import blackKnight from '../assets/pieces/KnightB.png';
import whitePawn from '../assets/pieces/PawnW.png';
import blackPawn from '../assets/pieces/PawnB.png';
import whiteRook from '../assets/pieces/RookW.png';
import blackRook from '../assets/pieces/RookB.png';
import whiteBishop from '../assets/pieces/BishopW.png';
import blackBishop from '../assets/pieces/BishopB.png';

// Mappaus (piece + color => image)
const pieceImages = {
    K: { w: whiteKing, b: blackKing },
    Q: { w: whiteQueen, b: blackQueen },
    R: { w: whiteRook, b: blackRook },
    B: { w: whiteBishop, b: blackBishop },
    N: { w: whiteKnight, b: blackKnight },
    P: { w: whitePawn, b: blackPawn }
};


export default function Piece({ piece, size }) {

    if (!piece) return null; // tyhjä ruutu

    const { type, color } = piece; // type = K,Q,R,B,N,P — color = w/b
    const imgSrc = pieceImages[type]?.[color];

    if (!imgSrc) return null;

    // If a fixed size (px) is provided, render with that size; otherwise fill parent
    const style = size
        ? {
              width: `${size}px`,
              height: `${size}px`,
              objectFit: "contain",
              pointerEvents: "none",
          }
        : {
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
          };

    return (
        <img src={imgSrc} alt={`${color === "w" ? "white" : "black"} ${type}`} style={style} />
    );
}
