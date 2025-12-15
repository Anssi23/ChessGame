using System.ComponentModel.DataAnnotations;

namespace ChessGame.Models
{
    public enum PieceType { King, Queen, Rook, Bishop, Knight, Pawn }
    public enum PieceColor { White, Black }

    public class Piece
    {
        [Key]
        public int Id { get; set; }

        public PieceType Type { get; set; }
        public PieceColor Color { get; set; }
        public required string Position { get; set; } = string.Empty;// esim. "e4"
        // Indicates whether this piece has moved (affects castling for king/rook)
        public bool HasMoved { get; set; } = false;
    }
}
