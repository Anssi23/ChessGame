export async function getBoard() {
    const res = await fetch("/api/game/board");
    return res.json();
}

export async function makeMove(from, to) {
    await fetch("/api/game/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to })
    });
}
