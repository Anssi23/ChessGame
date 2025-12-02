using ChessGame.Models;

namespace ChessGame.Services
{
    public class GameService
    {
        private Board _board;

        public GameService()
        {
            Board = Board.CreateInitialBoard();
            //_board = InitializeBoard();
        }

        public Board GetBoard() => _board;

        //private Board InitializeBoard()
        //{
        //    var board = new Board();
        //    // yksinkertainen aloitusasettelu (vain tornit esimerkkin‰)
        //    board.Pieces.Add(new Piece { Type = PieceType.Rook, Color = PieceColor.White, Position = "a1" });
        //    board.Pieces.Add(new Piece { Type = PieceType.Rook, Color = PieceColor.Black, Position = "a8" });
        //    return board;
        //}

        public bool TryMove(MoveRequest request, out string error)
        {
            var piece = Board.Squares[request.FromRow, request.FromCol];

            if (piece == null)
            {
                error = "No piece at source square.";
                return false;
            }
        
            // 1. Valitaan nappulan tyypin mukaan logiikka
            bool valid = piece.Type switch
            {
                PieceType.King => ValidateKingMove(request),
                PieceType.Queen => ValidateQueenMove(request),
                PieceType.Rook => ValidateRookMove(request),
                PieceType.Bishop => ValidateBishopMove(request),
                PieceType.Knight => ValidateKnightMove(request),
                PieceType.Pawn => ValidatePawnMove(request),
                _ => false
            };

            if (!valid)
            {
                error = "Illegal move.";
                return false;
            }

            // 2. Suoritetaan siirto
            Board.Squares[request.ToRow, request.ToCol] = piece;
            Board.Squares[request.FromRow, request.FromCol] = null;

            error = "";
            return true;
        }

        // T‰st‰ alkaen tehd‰‰n oikeat liikkeiden tarkistukset:
        private bool ValidateKingMove(MoveRequest r)
        {
            int dr = Math.Abs(r.ToRow - r.FromRow);
            int dc = Math.Abs(r.ToCol - r.FromCol);
            return dr <= 1 && dc <= 1;
        }

        private bool ValidateQueenMove(MoveRequest r)
        {
            // liikkuminen kuin torni tai l‰hetti
            return ValidateRookMove(r) || ValidateBishopMove(r);
        }

        private bool ValidateRookMove(MoveRequest r)
        {
            return r.FromRow == r.ToRow || r.FromCol == r.ToCol;
        }

        private bool ValidateBishopMove(MoveRequest r)
        {
            return Math.Abs(r.ToRow - r.FromRow) == Math.Abs(r.ToCol - r.FromCol);
        }

        private bool ValidateKnightMove(MoveRequest r)
        {
            int dr = Math.Abs(r.ToRow - r.FromRow);
            int dc = Math.Abs(r.ToCol - r.FromCol);
            return (dr == 2 && dc == 1) || (dr == 1 && dc == 2);
        }

        private bool ValidatePawnMove(MoveRequest r)
        {
            // (voit lis‰t‰ ohestalyˆnnin, en passant, promootion myˆhemmin)
            return r.FromCol == r.ToCol &&
                   Math.Abs(r.ToRow - r.FromRow) == 1;
        }

        public void MovePiece(Move move)
        {
            var piece = _board.Pieces.FirstOrDefault(p => p.Position == move.From);
            if (piece != null)
                piece.Position = move.To;
        }
    }
}
