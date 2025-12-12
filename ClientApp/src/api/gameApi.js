export async function getBoard() {
    const res = await fetch("/api/chess/board");
    return res.json();
}

export async function makeMove(move) {
    await fetch("/api/chess/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(move)
    });
}

export async function saveGame(name) {
    const res = await fetch(`/api/chess/save?name=${encodeURIComponent(name || '')}`, {
        method: 'POST'
    });
    return res.json(); // { id }
}

export async function getSaves() {
    const res = await fetch('/api/chess/saves');
    return res.json();
}

export async function loadGame(id) {
    const res = await fetch(`/api/chess/load/${encodeURIComponent(id)}`);
    return res.json();
}
