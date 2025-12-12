using Microsoft.AspNetCore.Mvc;
using ChessGame.Services;
using ChessGame.Models;
using Microsoft.AspNetCore.Http;
using System.Collections.Generic;

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
        public IActionResult MakeMove([FromBody] MoveRequest move)
        {
            if (_gameService.TryMove(move, out string error))
                return Ok(_gameService.GetSerializableBoard());

            return BadRequest(new { error });

        }

        [HttpGet("board")]
        public IActionResult GetBoard()
        {
            return Ok(_gameService.GetSerializableBoard());
        }
        
        [HttpPost("save")]
        public IActionResult SaveGame([FromQuery] string name)
        {
            if (string.IsNullOrWhiteSpace(name)) name = "autosave";
            try
            {
                var id = _gameService.SaveGame(name);
                return Ok(new { id });
            }
            catch (System.Exception ex)
            {
                // return error details to client for debugging (do not expose in production)
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = ex.Message });
            }
        }

        [HttpGet("load/{id}")]
        public IActionResult LoadGame(string id)
        {
            if (_gameService.LoadGame(id))
                return Ok(_gameService.GetSerializableBoard());
            return NotFound();
        }

        [HttpGet("saves")]
        public IActionResult GetSaves()
        {
            var list = _gameService.GetSavedGames();
            return Ok(list);
        }
       
    }
}
