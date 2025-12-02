const initialBoard = [
    // rivi 0 (musta kuningas ym.)
    [
        { type: "R", color: "b" },
        { type: "N", color: "b" },
        { type: "B", color: "b" },
        { type: "Q", color: "b" },
        { type: "K", color: "b" },
        { type: "B", color: "b" },
        { type: "N", color: "b" },
        { type: "R", color: "b" },
    ],

    // rivi 1 mustat sotilaat
    new Array(8).fill({ type: "P", color: "b" }),

    // rivit 2–5 tyhjät
    new Array(8).fill(null),
    new Array(8).fill(null),
    new Array(8).fill(null),
    new Array(8).fill(null),

    // rivi 6 valkoiset sotilaat
    new Array(8).fill({ type: "P", color: "w" }),

    // rivi 7 (valkoinen kuningas ym.)
    [
        { type: "R", color: "w" },
        { type: "N", color: "w" },
        { type: "B", color: "w" },
        { type: "Q", color: "w" },
        { type: "K", color: "w" },
        { type: "B", color: "w" },
        { type: "N", color: "w" },
        { type: "R", color: "w" },
    ],
];

export default initialBoard;
