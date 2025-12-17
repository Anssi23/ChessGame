using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using System;

namespace ChessGame.Hubs
{
    public class ChessHub : Hub
    {
        public override Task OnConnectedAsync()
        {
            try { Console.WriteLine($"ChessHub: client connected: {Context.ConnectionId}"); } catch { }
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception? exception)
        {
            try { Console.WriteLine($"ChessHub: client disconnected: {Context.ConnectionId} ({exception?.Message})"); } catch { }
            return base.OnDisconnectedAsync(exception);
        }
    }
}
