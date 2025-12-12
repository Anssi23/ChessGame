using System.Collections.Generic;
using System.Linq;

namespace ChessGame.Models
{
    public class Board
    {
        // 8x8 board: [row, col], row 0 = black backrank, row 7 = white backrank
        public Piece?[,] Squares { get; set; } = new Piece?[8,8];

        // Convenience list view of pieces (derived from squares)
        public List<Piece> Pieces
        {
            get
            {
                var list = new List<Piece>();
                for (int r = 0; r < 8; r++)
                    for (int c = 0; c < 8; c++)
                        if (Squares[r,c] != null) list.Add(Squares[r,c]);
                return list;
            }
            set
            {
                // clear and set from list
                Squares = new Piece?[8,8];
                foreach (var p in value)
                {
                    // if position provided, place accordingly
                    if (!string.IsNullOrEmpty(p.Position) && p.Position.Length >= 2)
                    {
                        int col = p.Position[0] - 'a';
                        int rank = int.Parse(p.Position[1].ToString());
                        int row = 8 - rank;
                        if (row >= 0 && row < 8 && col >= 0 && col < 8)
                            Squares[row, col] = p;
                    }
                }
            }
        }

        public static Board CreateInitialBoard()
        {
            var board = new Board();

            // Black backrank (row 0)
            var backBlack = new Piece[] {
                new Piece { Type = PieceType.Rook, Color = PieceColor.Black, Position = "a8" },
                new Piece { Type = PieceType.Knight, Color = PieceColor.Black, Position = "b8" },
                new Piece { Type = PieceType.Bishop, Color = PieceColor.Black, Position = "c8" },
                new Piece { Type = PieceType.Queen, Color = PieceColor.Black, Position = "d8" },
                new Piece { Type = PieceType.King, Color = PieceColor.Black, Position = "e8" },
                new Piece { Type = PieceType.Bishop, Color = PieceColor.Black, Position = "f8" },
                new Piece { Type = PieceType.Knight, Color = PieceColor.Black, Position = "g8" },
                new Piece { Type = PieceType.Rook, Color = PieceColor.Black, Position = "h8" }
            };

            for (int i = 0; i < 8; i++) board.Squares[0, i] = backBlack[i];

            // Black pawns row 1 -> rank 7
            for (int c = 0; c < 8; c++)
            {
                var p = new Piece { Type = PieceType.Pawn, Color = PieceColor.Black, Position = string.Concat((char)('a' + c), '7') };
                board.Squares[1, c] = p;
            }

            // empty rows 2-5
            for (int r = 2; r <= 5; r++)
                for (int c = 0; c < 8; c++) board.Squares[r, c] = null;

            // White pawns row 6 -> rank 2
            for (int c = 0; c < 8; c++)
            {
                var p = new Piece { Type = PieceType.Pawn, Color = PieceColor.White, Position = string.Concat((char)('a' + c), '2') };
                board.Squares[6, c] = p;
            }

            // White backrank row 7 -> rank 1
            var backWhite = new Piece[] {
                new Piece { Type = PieceType.Rook, Color = PieceColor.White, Position = "a1" },
                new Piece { Type = PieceType.Knight, Color = PieceColor.White, Position = "b1" },
                new Piece { Type = PieceType.Bishop, Color = PieceColor.White, Position = "c1" },
                new Piece { Type = PieceType.Queen, Color = PieceColor.White, Position = "d1" },
                new Piece { Type = PieceType.King, Color = PieceColor.White, Position = "e1" },
                new Piece { Type = PieceType.Bishop, Color = PieceColor.White, Position = "f1" },
                new Piece { Type = PieceType.Knight, Color = PieceColor.White, Position = "g1" },
                new Piece { Type = PieceType.Rook, Color = PieceColor.White, Position = "h1" }
            };
            for (int i = 0; i < 8; i++) board.Squares[7, i] = backWhite[i];

            return board;
        }
    }
}
