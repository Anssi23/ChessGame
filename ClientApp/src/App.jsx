import React, { useState } from "react";
import ChessBoard from "./components/ChessBoard";
import initialBoard from "./initialBoard";


function App() {
    const [board, setBoard] = useState(initialBoard);

    return <ChessBoard board={board} setBoard={setBoard} />;
}

export default App;
