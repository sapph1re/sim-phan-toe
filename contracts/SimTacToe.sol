// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.30;

/// @title Simultaneous Tic-Tac-Toe game, unencrypted version
/// @author Roman V (https://github.com/sapph1re)
/// @notice Since it's unencrypted, it doesn't really make sense because you can see
/// the other player's moves onchain as they submit them. Only with confidentiality
/// a simultaneous game will make sense. This implementation is a preparatory step
/// for the implementation of the FHE version.
contract SimTacToe {
    struct Game {
        uint256 gameId;
        address playerOne;
        address playerTwo;
        Cell[3][3] board;
        Winner winner;
    }

    struct Move {
        bool isMade;
        uint8 x;
        uint8 y;
    }

    enum Cell {
        Empty,
        Player1,
        Player2
    }

    enum Winner {
        None,
        Player1,
        Player2,
        Draw
    }

    Game[] public games;
    uint256 public gameCount = 0;
    mapping(uint256 => mapping(address => Move)) public nextMoves;

    event GameStarted(uint256 gameId, address playerOne);
    event PlayerJoined(uint256 gameId, address playerTwo);
    event MoveSubmitted(uint256 gameId, address player);
    event MoveMade(uint256 gameId, uint8 x, uint8 y, address player);
    event MovesCollided(uint256 gameId, uint8 x, uint8 y);
    event GameEnded(uint256 gameId, Winner winner);

    function startGame() external {
        Game memory game;
        game.gameId = gameCount;
        game.playerOne = msg.sender;
        games.push(game);
        emit GameStarted(gameCount, msg.sender);
        gameCount++;
    }

    function joinGame(uint256 _gameId) external {
        Game memory game = games[_gameId];
        require(game.playerOne != address(0), "Game not found.");
        require(game.playerTwo == address(0), "Game is already full.");
        game.playerTwo = msg.sender;
        games[_gameId] = game;
        emit PlayerJoined(_gameId, msg.sender);
    }

    function makeMove(uint256 _gameId, uint8 _x, uint8 _y) external {
        Game memory game = games[_gameId];
        require(game.playerOne != address(0) && game.playerTwo != address(0), "Game has not started yet.");
        require(game.winner == Winner.None, "Game is finished.");
        require(msg.sender == game.playerOne || msg.sender == game.playerTwo, "You are not a player in this game.");
        require(!nextMoves[_gameId][msg.sender].isMade, "Move already made.");
        require(_x < 3 && _y < 3, "Invalid move.");
        require(game.board[_x][_y] == Cell.Empty, "Cell is not empty.");

        nextMoves[_gameId][msg.sender] = Move({isMade: true, x: _x, y: _y});
        emit MoveSubmitted(_gameId, msg.sender);
        if (nextMoves[_gameId][game.playerOne].isMade && nextMoves[_gameId][game.playerTwo].isMade) {
            processMoves(_gameId);
        }
    }

    function processMoves(uint256 _gameId) private {
        Game memory game = games[_gameId];
        Move memory moveOne = nextMoves[_gameId][game.playerOne];
        Move memory moveTwo = nextMoves[_gameId][game.playerTwo];
        nextMoves[_gameId][game.playerOne].isMade = false;
        nextMoves[_gameId][game.playerTwo].isMade = false;
        if (moveOne.x == moveTwo.x && moveOne.y == moveTwo.y) {
            emit MovesCollided(_gameId, moveOne.x, moveOne.y);
            return;
        }
        game.board[moveOne.x][moveOne.y] = Cell.Player1;
        game.board[moveTwo.x][moveTwo.y] = Cell.Player2;
        game.winner = whoWins(game.board);
        games[_gameId] = game;
        emit MoveMade(_gameId, moveOne.x, moveOne.y, game.playerOne);
        emit MoveMade(_gameId, moveTwo.x, moveTwo.y, game.playerTwo);
        if (game.winner != Winner.None) {
            emit GameEnded(_gameId, game.winner);
        }
    }

    function whoWins(Cell[3][3] memory _board) private pure returns (Winner winner) {
        Winner winnerRow = whoWinsByRow(_board);
        if (winnerRow == Winner.Draw) return Winner.Draw;
        Winner winnerColumn = whoWinsByColumn(_board);
        if (winnerColumn == Winner.Draw) return Winner.Draw;
        Winner winnerDiagonal = whoWinsByDiagonal(_board);

        bool playerOneWins = winnerRow == Winner.Player1 ||
            winnerColumn == Winner.Player1 ||
            winnerDiagonal == Winner.Player1;
        bool playerTwoWins = winnerRow == Winner.Player2 ||
            winnerColumn == Winner.Player2 ||
            winnerDiagonal == Winner.Player2;
        if (playerOneWins && playerTwoWins) return Winner.Draw;
        if (playerOneWins) return Winner.Player1;
        if (playerTwoWins) return Winner.Player2;

        if (isBoardFull(_board)) return Winner.Draw;
        return Winner.None;
    }

    function whoWinsByRow(Cell[3][3] memory _board) private pure returns (Winner winner) {
        winner = Winner.None;
        for (uint8 i = 0; i < 3; i++) {
            if (_board[i][0] == _board[i][1] && _board[i][1] == _board[i][2] && _board[i][0] != Cell.Empty) {
                if (winner != Winner.None) {
                    return Winner.Draw;
                }
                winner = _board[i][0] == Cell.Player1 ? Winner.Player1 : Winner.Player2;
            }
        }
    }

    function whoWinsByColumn(Cell[3][3] memory _board) private pure returns (Winner winner) {
        winner = Winner.None;
        for (uint8 i = 0; i < 3; i++) {
            if (_board[0][i] == _board[1][i] && _board[1][i] == _board[2][i] && _board[0][i] != Cell.Empty) {
                if (winner != Winner.None) {
                    return Winner.Draw;
                }
                winner = _board[0][i] == Cell.Player1 ? Winner.Player1 : Winner.Player2;
            }
        }
    }

    function whoWinsByDiagonal(Cell[3][3] memory _board) private pure returns (Winner winner) {
        winner = Winner.None;
        if (_board[1][1] == Cell.Empty) {
            return winner;
        }
        if (_board[0][0] == _board[1][1] && _board[1][1] == _board[2][2]) {
            winner = _board[0][0] == Cell.Player1 ? Winner.Player1 : Winner.Player2;
        }
        if (_board[0][2] == _board[1][1] && _board[1][1] == _board[2][0]) {
            winner = _board[0][2] == Cell.Player1 ? Winner.Player1 : Winner.Player2;
        }
        return winner;
    }

    function isBoardFull(Cell[3][3] memory _board) private pure returns (bool) {
        for (uint8 i = 0; i < 3; i++) {
            for (uint8 j = 0; j < 3; j++) {
                if (_board[i][j] == Cell.Empty) {
                    return false;
                }
            }
        }
        return true;
    }

    function getGame(uint256 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }

    function getOpenGames() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].playerTwo == address(0)) {
                count++;
            }
        }
        uint256[] memory openGames = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].playerTwo == address(0)) {
                openGames[index] = i;
                index++;
            }
        }
        return openGames;
    }

    function getGamesByPlayer(address _player) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].playerOne == _player || games[i].playerTwo == _player) {
                count++;
            }
        }
        uint256[] memory playerGames = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].playerOne == _player || games[i].playerTwo == _player) {
                playerGames[index] = i;
                index++;
            }
        }
        return playerGames;
    }
}
