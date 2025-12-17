using ChessGame.Models;
using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Collections.Generic;
using ChessGame.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace ChessGame.Services
{
    public class GameService
    {
        private Board _board;
        private readonly IHubContext<ChessHub> _hubContext;
        private string _currentPlayer = "w";
        private readonly object _lock = new object();
        private readonly string _saveDir = Path.Combine(Directory.GetCurrentDirectory(), "saves");

        public GameService(IHubContext<ChessHub> hubContext)
        {
            _hubContext = hubContext;
            _board = Board.CreateInitialBoard();
            //_board = InitializeBoard();
            // Try to load latest save on startup
            try
            {
                if (Directory.Exists(_saveDir))
                {
                    var files = Directory.GetFiles(_saveDir, "*.json");
                    if (files.Length > 0)
                    {
                        var latest = files.OrderByDescending(f => File.GetLastWriteTimeUtc(f)).First();
                        var id = Path.GetFileNameWithoutExtension(latest);
                        LoadGame(id);
                    }
                }
            }
            catch { }
        }

        public Board GetBoard() => _board;

        public string GetCurrentPlayer() => _currentPlayer;

        // Return a JSON-serializable representation of the board (jagged array)
        public object GetSerializableBoard() => BoardToSerializable(_board);

        public string SaveGame(string name)
        {
            if (!Directory.Exists(_saveDir)) Directory.CreateDirectory(_saveDir);
            var id = System.Guid.NewGuid().ToString();
            // timestamp and sanitized name to include in filename
            var timestamp = DateTime.UtcNow;
            var tsForFile = timestamp.ToString("yyyyMMddTHHmmssZ");
            // sanitize name for filesystem
            var safeName = string.IsNullOrWhiteSpace(name) ? "autosave" : string.Concat(name.Where(ch => !Path.GetInvalidFileNameChars().Contains(ch))).Trim();
            if (string.IsNullOrEmpty(safeName)) safeName = "autosave";
            // limit length
            if (safeName.Length > 32) safeName = safeName.Substring(0, 32);
            var fileName = $"{tsForFile}_{safeName}_{id}.json";
            var path = Path.Combine(_saveDir, fileName);
            // Serialize to a JSON-friendly jagged array (Piece DTOs) because System.Text.Json
            // does not support multi-dimensional arrays like Piece[,]
            var dto = BoardToSerializable(_board);

            // Wrap with metadata (id, name, timestamp) so saved file contains timestamp
            var wrapper = new
            {
                Id = id,
                Name = name,
                TimestampUtc = timestamp.ToString("o"),
                FileName = fileName,
                Board = dto
            };

            var json = JsonSerializer.Serialize(wrapper);
            File.WriteAllText(path, json);

            // Broadcast board update to connected SignalR clients (best-effort)
            try
            {
                Console.WriteLine("GameService: broadcasting BoardUpdated (save)");
                var payload = new { Board = dto, Squares = dto.Squares, CurrentPlayer = _currentPlayer };
                _hubContext?.Clients.All.SendAsync("BoardUpdated", payload);
            }
            catch (Exception ex) { Console.WriteLine("SignalR broadcast failed: " + ex.Message); }

            return id;
        }

        public bool LoadGame(string id)
        {
            // The saved files are named like "{timestamp}_{safeName}_{id}.json" where Id is stored inside JSON.
            // Try direct filename first (in case caller passed full filename without extension), otherwise search files for matching Id.
            string path = Path.Combine(_saveDir, id + ".json");
            if (!File.Exists(path))
            {
                // search files for JSON containing matching Id
                var files = Directory.GetFiles(_saveDir, "*.json");
                string found = null;
                foreach (var f in files)
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(File.ReadAllText(f));
                        var root = doc.RootElement;
                        if (root.TryGetProperty("Id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                        {
                            var fileId = idProp.GetString();
                            if (fileId == id)
                            {
                                found = f;
                                break;
                            }
                        }
                        // also accept when filename (without extension) equals id
                        if (Path.GetFileNameWithoutExtension(f).Equals(id, StringComparison.OrdinalIgnoreCase))
                        {
                            found = f;
                            break;
                        }
                    }
                    catch
                    {
                        // ignore parse errors
                    }
                }
                if (found == null) return false;
                path = found;
            }
            var json = File.ReadAllText(path);
            // Deserialize into DTO and reconstruct Board.
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                JsonElement boardElem;

                // Support both new wrapper format { Id, Name, TimestampUtc, Board: { Squares: [...] } }
                // and legacy format which serialized the DTO directly ({ Squares: [...] }).
                if (root.TryGetProperty("Board", out var b))
                {
                    boardElem = b;
                }
                else
                {
                    boardElem = root;
                }

                if (!boardElem.TryGetProperty("Squares", out var squaresElem)) return false;

                // Deserialize Squares into jagged array
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var squares = JsonSerializer.Deserialize<Piece?[][]>(squaresElem.GetRawText(), options);
                if (squares == null) return false;

                // build DTO from squares
                var dto = new SerializableBoardDto();
                for (int r = 0; r < 8; r++)
                {
                    dto.Squares[r] = new Piece?[8];
                    for (int c = 0; c < 8; c++) dto.Squares[r][c] = squares[r][c];
                }

                var board = SerializableToBoard(dto);
                _board = board;

                // Broadcast updated board to clients (load resets current player to white)
                try {
                    Console.WriteLine("GameService: broadcasting BoardUpdated (load)");
                    _currentPlayer = "w";
                    var payload = new { Board = dto, CurrentPlayer = _currentPlayer };
                    _hubContext?.Clients.All.SendAsync("BoardUpdated", payload);
                } catch (Exception ex) { Console.WriteLine("SignalR broadcast failed: " + ex.Message); }

                return true;
            }
            catch
            {
                return false;
            }
        }

        public List<SaveInfo> GetSavedGames()
        {
            var result = new List<SaveInfo>();
            if (!Directory.Exists(_saveDir)) return result;

            var files = Directory.GetFiles(_saveDir, "*.json");
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            foreach (var f in files.OrderByDescending(fn => File.GetLastWriteTimeUtc(fn)))
            {
                try
                {
                    var txt = File.ReadAllText(f);
                    using var doc = JsonDocument.Parse(txt);
                    var root = doc.RootElement;
                    string id = Path.GetFileNameWithoutExtension(f);
                    string name = null;
                    DateTime timestamp = File.GetLastWriteTimeUtc(f);

                    if (root.TryGetProperty("Id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                        id = idProp.GetString() ?? id;
                    if (root.TryGetProperty("Name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String)
                        name = nameProp.GetString();
                    string tsString = File.GetLastWriteTimeUtc(f).ToString("o");
                    if (root.TryGetProperty("TimestampUtc", out var tProp))
                    {
                        if (tProp.ValueKind == JsonValueKind.String)
                        {
                            var s = tProp.GetString();
                            if (!string.IsNullOrEmpty(s)) tsString = s;
                        }
                        else if (tProp.ValueKind == JsonValueKind.Number && tProp.TryGetInt64(out var unix))
                        {
                            tsString = DateTimeOffset.FromUnixTimeSeconds(unix).UtcDateTime.ToString("o");
                        }
                    }

                    var fileNameOnly = Path.GetFileName(f);
                    // If JSON contains FileName property, prefer that (it was written when saving)
                    if (root.TryGetProperty("FileName", out var fnProp) && fnProp.ValueKind == JsonValueKind.String)
                    {
                        var fn = fnProp.GetString();
                        if (!string.IsNullOrEmpty(fn)) fileNameOnly = fn;
                    }

                    result.Add(new SaveInfo { Id = id, TimestampUtc = tsString, Name = name ?? id, FileName = fileNameOnly });
                }
                catch
                {
                    // ignore malformed
                }
            }

            return result;
        }

        // DTO for serialization: jagged array of nullable Piece
        private class SerializableBoardDto
        {
            public Piece?[][] Squares { get; set; } = new Piece?[8][];
        }

        private SerializableBoardDto BoardToSerializable(Board b)
        {
            var dto = new SerializableBoardDto();
            for (int r = 0; r < 8; r++)
            {
                dto.Squares[r] = new Piece?[8];
                for (int c = 0; c < 8; c++) dto.Squares[r][c] = b.Squares[r,c];
            }
            return dto;
        }

        private Board SerializableToBoard(SerializableBoardDto dto)
        {
            var b = new Board();
            for (int r = 0; r < 8; r++)
            {
                for (int c = 0; c < 8; c++)
                {
                    var p = dto.Squares[r][c];
                    b.Squares[r, c] = p;
                }
            }
            return b;
        }

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
            lock (_lock)
            {
            
            var piece = _board.Squares[request.FromRow, request.FromCol];

            if (piece == null)
            {
                error = "No piece at source square.";
                Console.WriteLine($"TryMove failed: no piece at {request.FromRow},{request.FromCol}");
                // broadcast current board so clients can resync
                try { var dtoErr = BoardToSerializable(_board); _hubContext?.Clients.All.SendAsync("BoardUpdated", new { Board = dtoErr, CurrentPlayer = _currentPlayer }); } catch { }
                return false;
            }
            // Enforce turn: piece color must match current player
            var pieceColorLetter = piece.Color == PieceColor.White ? "w" : "b";
            if (pieceColorLetter != _currentPlayer)
            {
                error = "Not that player's turn.";
                Console.WriteLine($"TryMove failed: attempted move by {pieceColorLetter} while current player is {_currentPlayer}");
                try { var dtoErr = BoardToSerializable(_board); _hubContext?.Clients.All.SendAsync("BoardUpdated", new { Board = dtoErr, CurrentPlayer = _currentPlayer }); } catch { }
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
                Console.WriteLine($"TryMove failed: illegal move from {request.FromRow},{request.FromCol} to {request.ToRow},{request.ToCol} by piece {piece.Type} {piece.Color}");
                try { var dtoErr = BoardToSerializable(_board); _hubContext?.Clients.All.SendAsync("BoardUpdated", new { Board = dtoErr, CurrentPlayer = _currentPlayer }); } catch { }
                return false;
            }

            // 2. Suoritetaan siirto
            _board.Squares[request.ToRow, request.ToCol] = piece;
            _board.Squares[request.FromRow, request.FromCol] = null;

            // update piece's Position string (e.g., 'e4') so saved JSON contains current positions
            if (piece != null)
            {
                piece.Position = ColRowToPosition(request.ToRow, request.ToCol);
                // mark piece as moved (affects castling rules)
                piece.HasMoved = true;
            }

            // If this was a castling move (king moves two columns), also move the rook and mark it moved
            if (piece != null && piece.Type == PieceType.King && Math.Abs(request.ToCol - request.FromCol) == 2)
            {
                var row = request.ToRow;
                // king-side castling
                if (request.ToCol == 6)
                {
                    var rook = _board.Squares[row, 7];
                    if (rook != null && rook.Type == PieceType.Rook)
                    {
                        _board.Squares[row, 5] = rook;
                        _board.Squares[row, 7] = null;
                        rook.Position = ColRowToPosition(row, 5);
                        rook.HasMoved = true;
                    }
                }
                // queen-side castling
                else if (request.ToCol == 2)
                {
                    var rook = _board.Squares[row, 0];
                    if (rook != null && rook.Type == PieceType.Rook)
                    {
                        _board.Squares[row, 3] = rook;
                        _board.Squares[row, 0] = null;
                        rook.Position = ColRowToPosition(row, 3);
                        rook.HasMoved = true;
                    }
                }
            }

            // flip current player
            _currentPlayer = _currentPlayer == "w" ? "b" : "w";

            // Broadcast updated board to clients with current player
            try
            {
                var dto = BoardToSerializable(_board);
                var payload = new { Board = dto, Squares = dto.Squares, CurrentPlayer = _currentPlayer };
                var task = _hubContext?.Clients.All.SendAsync("BoardUpdated", payload);
                if (task != null)
                {
                    task.ContinueWith(t =>
                    {
                        if (t.IsFaulted)
                        {
                            Console.WriteLine("SignalR broadcast failed: " + t.Exception?.GetBaseException().Message);
                        }
                        else
                        {
                            Console.WriteLine("SignalR broadcast succeeded (TryMove)");
                        }
                    });
                }
            }
            catch (Exception ex) { Console.WriteLine("SignalR broadcast scheduling failed: " + ex.Message); }

            error = "";
            Console.WriteLine($"TryMove success: {request.FromRow},{request.FromCol} -> {request.ToRow},{request.ToCol} by {piece.Type} {piece.Color}");
            return true;
            }
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
            // Pawn move validation: support 1-step, initial 2-step, and captures.
            // (en passant, promotion and other special rules can be added later)
            var piece = _board.Squares[r.FromRow, r.FromCol];
            if (piece == null) return false;

            // Determine direction: white moves up (decreasing row), black moves down (increasing row)
            var color = piece.Color;
            int dir = color == PieceColor.White ? -1 : 1;
            int startRow = color == PieceColor.White ? 6 : 1; // row indices: 0..7

            int dr = r.ToRow - r.FromRow;
            int dc = r.ToCol - r.FromCol;

            // Forward moves (no capture)
            if (dc == 0)
            {
                // one step forward
                if (dr == dir && _board.Squares[r.ToRow, r.ToCol] == null) return true;

                // two steps from start row: both squares must be empty
                if (r.FromRow == startRow && dr == 2 * dir)
                {
                    var intermediateRow = r.FromRow + dir;
                    if (_board.Squares[intermediateRow, r.FromCol] == null && _board.Squares[r.ToRow, r.ToCol] == null)
                        return true;
                }

                return false;
            }

            // Captures: diagonal by one
            if (Math.Abs(dc) == 1 && dr == dir)
            {
                var target = _board.Squares[r.ToRow, r.ToCol];
                if (target != null && target.Color != piece.Color) return true;
            }

            return false;
        }

        public void MovePiece(Move move)
        {
            var piece = _board.Pieces.FirstOrDefault(p => p.Position == move.From);
            if (piece != null)
                piece.Position = move.To;
        }

        private static string ColRowToPosition(int row, int col)
        {
            // col 0 -> 'a', row 7 -> rank 1
            char file = (char)('a' + col);
            int rank = 8 - row;
            return string.Concat(file, rank.ToString());
        }
    }
}
