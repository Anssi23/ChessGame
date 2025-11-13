namespace ChessGame.Models
{
    public enum PieceType { King, Queen, Rook, Bishop, Knight, Pawn }
    public enum PieceColor { White, Black }

    public class Piece
    {
        public PieceType Type { get; set; }
        public PieceColor Color { get; set; }
        public string Position { get; set; } // esim. "e4"
    }
}
