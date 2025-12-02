using Microsoft.AspNetCore.Mvc;
using ChessGame.Services;
using ChessGame.Models;

namespace ChessGame.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChessController : ControllerBase
    {
        private readonly GameService _gameService;

        public ChessController(GameService gameService)
        {
            _gameService = gameService;
        }

        [HttpPost("move")]
        public IActionResult MakeMove([FromBody] Move move)
        {
            if (_gameService.TryMove(move, out string error))
                return Ok(_gameService.GetBoard());

            return BadRequest();

        }

        [HttpGet("board")]
        public IActionResult GetBoard()
        {
            return Ok(_gameService.GetBoard());
        }
       
    }
}
