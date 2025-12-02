using Microsoft.EntityFrameworkCore;
using ChessGame.Models;

namespace ChessGame.Data
{
    public class ChessContext : DbContext
    {
        public ChessContext(DbContextOptions<ChessContext> options) : base(options) { }

        public DbSet<Piece> Pieces { get; set; }
    }
}
