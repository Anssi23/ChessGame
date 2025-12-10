import React, { useState } from "react";
import ChessBoard from "./components/ChessBoard";
import initialBoard from "./initialBoard";


function App() {
    const [board, setBoard] = useState(initialBoard);
    const [currentPlayer, setCurrentPlayer] = useState("w");
    const [message, setMessage] = useState("");

    return (
        <div style={{ padding: "20px", fontFamily: "Arial" }}>

            {/* INFO-ILMOITUKSET */}
            {message && (
                <div
                    style={{
                        background: "rgba(255, 0, 0, 0.6)",
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

            {/* Vuoron highlight-teksti */}
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
        
            <ChessBoard
                board={board}
                setBoard={setBoard}
                currentPlayer={currentPlayer}
                setCurrentPlayer={setCurrentPlayer}
                setMessage={setMessage}
            />
        </div>
    );
}

export default App;
