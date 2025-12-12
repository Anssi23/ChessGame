using System;

namespace ChessGame.Models
{
    public class SaveInfo
    {
        public string Id { get; set; } = string.Empty;
        // ISO-8601 timestamp string
        public string TimestampUtc { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
    }
}
