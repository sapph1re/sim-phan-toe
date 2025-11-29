// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.30;

import { FHE, ebool, euint8, externalEuint8 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Simultaneous Phantom Tic-Tac-Toe game with FHEVM
/// @author Roman V (https://github.com/sapph1re)
contract SimPhanToe is ZamaEthereumConfig {

    struct Game {
        uint256 gameId;
        address player1;
        address player2;
        euint8[3][3] board;     // encrypted Cells
        euint8 winner;          // encrypted Winner
        bool isFinished;
    }
    
    struct Move {
        bool isSubmitted;
        bool isMade;
        ebool isInvalid;
        ebool isCellOccupied;
        euint8 x;
        euint8 y;
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

    // encrypted enums
    euint8 internal CELL_EMPTY;
    euint8 internal CELL_PLAYER1;
    euint8 internal CELL_PLAYER2;
    euint8 internal WINNER_NONE;
    euint8 internal WINNER_PLAYER1;
    euint8 internal WINNER_PLAYER2;
    euint8 internal WINNER_DRAW;

    event GameStarted(uint256 indexed gameId, address indexed player1);
    event PlayerJoined(uint256 indexed gameId, address indexed player2);
    event MoveSubmitted(uint256 indexed gameId, address indexed player);
    event MoveInvalid(uint256 indexed gameId, address indexed player);
    event MoveMade(uint256 indexed gameId, address indexed player);
    event MovesProcessed(uint256 indexed gameId);
    event GameUpdated(uint256 indexed gameId, Winner winner);


    constructor() {
        CELL_EMPTY = FHE.asEuint8(uint8(Cell.Empty));
        CELL_PLAYER1 = FHE.asEuint8(uint8(Cell.Player1));
        CELL_PLAYER2 = FHE.asEuint8(uint8(Cell.Player2));
        WINNER_NONE = FHE.asEuint8(uint8(Winner.None));
        WINNER_PLAYER1 = FHE.asEuint8(uint8(Winner.Player1));
        WINNER_PLAYER2 = FHE.asEuint8(uint8(Winner.Player2));
        WINNER_DRAW = FHE.asEuint8(uint8(Winner.Draw));
    }

    function startGame() external {
        Game memory game = Game({
            gameId: gameCount,
            player1: msg.sender,
            player2: address(0),
            board: [[CELL_EMPTY, CELL_EMPTY, CELL_EMPTY], [CELL_EMPTY, CELL_EMPTY, CELL_EMPTY], [CELL_EMPTY, CELL_EMPTY, CELL_EMPTY]],
            winner: WINNER_NONE,
            isFinished: false
        });
        games.push(game);
        emit GameStarted(game.gameId, game.player1);
        gameCount++;
    }

    function joinGame(uint256 _gameId) external {
        Game memory game = games[_gameId];
        require(game.player1 != address(0), "Game not found.");
        require(game.player2 == address(0), "Game is already full.");
        game.player2 = msg.sender;
        games[_gameId] = game;
        emit PlayerJoined(_gameId, msg.sender);
    }

    function submitMove(uint256 _gameId, externalEuint8 _inputX, externalEuint8 _inputY, bytes calldata _inputProof) external {
        Game memory game = games[_gameId];
        require(game.player1 != address(0) && game.player2 != address(0), "Game has not started yet.");
        require(!game.isFinished, "Game is finished.");
        require(msg.sender == game.player1 || msg.sender == game.player2, "You are not a player in this game.");
        require(!nextMoves[_gameId][msg.sender].isSubmitted, "Move already submitted.");
        
        euint8 x = FHE.fromExternal(_inputX, _inputProof);
        euint8 y = FHE.fromExternal(_inputY, _inputProof);

        ebool xValid = FHE.lt(x, 3);
        ebool yValid = FHE.lt(y, 3);
        ebool cellEmpty = FHE.eq(getCell(game.board, x, y), CELL_EMPTY);
        ebool allValid = FHE.and(FHE.and(xValid, yValid), cellEmpty);
        
        Move memory move = nextMoves[_gameId][msg.sender];
        move.x = x;
        move.y = y;
        move.isSubmitted = true;
        move.isInvalid = FHE.not(allValid);
        move.isCellOccupied = FHE.not(cellEmpty);
        nextMoves[_gameId][msg.sender] = move;

        FHE.allowThis(move.x);
        FHE.allowThis(move.y);
        FHE.allowThis(move.isInvalid);
        FHE.allowThis(move.isCellOccupied);
        FHE.allow(move.x, msg.sender);
        FHE.allow(move.y, msg.sender);
        FHE.allow(move.isCellOccupied, msg.sender);
        FHE.makePubliclyDecryptable(move.isInvalid);

        emit MoveSubmitted(_gameId, msg.sender);
    }

    function finalizeMove(uint256 _gameId, address _player, bool _isInvalid, bytes memory _decryptionProof) external {
        // verify decryption of the move.isInvalid flag
        Move memory move = nextMoves[_gameId][_player];
        bytes32[] memory ciphertextHandles = new bytes32[](1);
        ciphertextHandles[0] = FHE.toBytes32(move.isInvalid);
        bytes memory abiEncodedCleartexts = abi.encode(_isInvalid);
        FHE.checkSignatures(ciphertextHandles, abiEncodedCleartexts, _decryptionProof);

        if (_isInvalid) {
            // let the user submit a different move
            move.isSubmitted = false;
            emit MoveInvalid(_gameId, _player);
        } else {
            // the move is accepted
            move.isMade = true;
            emit MoveMade(_gameId, _player);
        }
        nextMoves[_gameId][_player] = move;
        // process the moves if both players have made their moves
        Game memory game = games[_gameId];
        if (nextMoves[_gameId][game.player1].isMade && nextMoves[_gameId][game.player2].isMade) {
            processMoves(_gameId);
        }
    }

    function finalizeGameState(uint256 _gameId, uint8 _winner, bytes memory _decryptionProof) external {
        // verify decryption of the winner value
        Game memory game = games[_gameId];
        bytes32[] memory ciphertextHandles = new bytes32[](1);
        ciphertextHandles[0] = FHE.toBytes32(game.winner);
        bytes memory abiEncodedCleartexts = abi.encode(_winner);
        FHE.checkSignatures(ciphertextHandles, abiEncodedCleartexts, _decryptionProof);
        // finish the game if we have a winner
        if (_winner != uint8(Winner.None)) {
            game.isFinished = true;
            games[_gameId] = game;
        }
        emit GameUpdated(_gameId, Winner(_winner));
        // clients should reflect the new game state and announce the result if finished
    }

    function getGame(uint256 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }

    function getOpenGames() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].player2 == address(0)) {
                count++;
            }
        }
        uint256[] memory openGames = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].player2 == address(0)) {
                openGames[index] = i;
                index++;
            }
        }
        return openGames;
    }

    function getGamesByPlayer(address _player) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].player1 == _player || games[i].player2 == _player) {
                count++;
            }
        }
        uint256[] memory playerGames = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].player1 == _player || games[i].player2 == _player) {
                playerGames[index] = i;
                index++;
            }
        }
        return playerGames;
    }

    function processMoves(uint256 _gameId) private {
        Game storage game = games[_gameId];
        Move memory moveOne = nextMoves[_gameId][game.player1];
        Move memory moveTwo = nextMoves[_gameId][game.player2];
        // check for collision
        ebool collision = FHE.and(FHE.eq(moveOne.x,moveTwo.x), FHE.eq(moveOne.y, moveTwo.y));
        FHE.allow(collision, game.player1);
        FHE.allow(collision, game.player2);
        // set the cells according to the moves or don't change anything if they collided
        setCell(game.board, moveOne.x, moveOne.y, FHE.select(collision, CELL_EMPTY, CELL_PLAYER1));
        setCell(game.board, moveTwo.x, moveTwo.y, FHE.select(collision, CELL_EMPTY, CELL_PLAYER2));
        // technically, if there's a collision no move is made so there's no point in checking the winner,
        // but because we cannot really branch the logic in FHE I guess we can just afford to run it anyways
        // another approach would be to publicly decrypt the collision status to enable branching, but that
        // would require one more transaction, which would be worse UX
        game.winner = whoWins(_gameId);
        FHE.makePubliclyDecryptable(game.winner);
        // free nextMoves
        nextMoves[_gameId][game.player1] = Move();
        nextMoves[_gameId][game.player2] = Move();
        emit MovesProcessed(_gameId);
        // clients should check for collision and reflect it in the UI
        // then trigger decryption of the winner and call finalizeGameState()
    }

    function setCell(euint8[3][3] storage _board, euint8 _x, euint8 _y, euint8 _cell) private {
        for (uint8 i = 0; i < 3; i++) {
            for (uint8 j = 0; j < 3; j++) {
                _board[i][j] = FHE.select(FHE.and(FHE.eq(_x, i), FHE.eq(_y, j)), _cell, _board[i][j]);
            }
        }
    }

    function getCell(euint8[3][3] memory _board, euint8 _x, euint8 _y) private pure returns (euint8 cell) {
        for (uint8 i = 0; i < 3; i++) {
            for (uint8 j = 0; j < 3; j++) {
                cell = FHE.select(FHE.and(FHE.eq(_x, i), FHE.eq(_y, j)), _board[i][j], cell);
            }
        }
        return cell;
    }

    function whoWins(uint256 _gameId) private view returns (euint8 winner) {
        Game memory game = games[_gameId];
        euint8[3][3] memory board = game.board;
        // check each row, column and diagonal for winners
        euint8 winnerRow = whoWinsByRow(board);
        euint8 winnerColumn = whoWinsByColumn(board);
        euint8 winnerDiagonal = whoWinsByDiagonal(board);
        // if we have a draw on any of them then it's a draw
        ebool isDraw = FHE.or(FHE.or(FHE.eq(winnerRow, WINNER_DRAW), FHE.eq(winnerColumn, WINNER_DRAW)), FHE.eq(winnerDiagonal, WINNER_DRAW));
        // check if either player has won
        ebool player1Wins = FHE.or(FHE.or(FHE.eq(winnerRow, WINNER_PLAYER1), FHE.eq(winnerColumn, WINNER_PLAYER1)), FHE.eq(winnerDiagonal, WINNER_PLAYER1));
        ebool player2Wins = FHE.or(FHE.or(FHE.eq(winnerRow, WINNER_PLAYER2), FHE.eq(winnerColumn, WINNER_PLAYER2)), FHE.eq(winnerDiagonal, WINNER_PLAYER2));
        // if both won it's a draw
        isDraw = FHE.or(isDraw, FHE.and(player1Wins, player2Wins));
        // if no one is winning then check if the board is full
        ebool noWinners = FHE.and(FHE.and(FHE.not(player1Wins), FHE.not(player2Wins)), FHE.not(isDraw));
        isDraw = FHE.or(isDraw, FHE.and(noWinners, isBoardFull(board)));
        // return draw, none or winner
        winner = FHE.select(isDraw, WINNER_DRAW, FHE.select(noWinners, WINNER_NONE, FHE.select(player1Wins, WINNER_PLAYER1, WINNER_PLAYER2)));
        return winner;
    }

    function whoWinsByRow(euint8[3][3] memory _board) private view returns (euint8 winner) {
        winner = WINNER_NONE;
        for (uint8 i = 0; i < 3; i++) {
            // check each row if it's complete
            ebool rowComplete = FHE.and(FHE.and(FHE.eq(_board[i][0], _board[i][1]), FHE.eq(_board[i][1], _board[i][2])), FHE.ne(_board[i][0], CELL_EMPTY));
            // whose row is it?
            euint8 rowWinner = FHE.select(rowComplete, FHE.select(FHE.eq(_board[i][0], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2), WINNER_NONE);
            // if there's already a winner from another row then it's a draw
            // because one player can't complete two rows at the same time
            ebool rowHasWinner = FHE.ne(rowWinner, WINNER_NONE);
            ebool alreadyHasWinner = FHE.ne(winner, WINNER_NONE);
            ebool isDraw = FHE.and(rowHasWinner, alreadyHasWinner);
            winner = FHE.select(isDraw, WINNER_DRAW, FHE.select(rowHasWinner, rowWinner, winner));
        }
        return winner;
    }

    function whoWinsByColumn(euint8[3][3] memory _board) private view returns (euint8 winner) {
        winner = WINNER_NONE;
        for (uint8 i = 0; i < 3; i++) {
            // check each column if it's complete
            ebool columnComplete = FHE.and(FHE.and(FHE.eq(_board[0][i], _board[1][i]), FHE.eq(_board[1][i], _board[2][i])), FHE.ne(_board[0][i], CELL_EMPTY));
            // whose column is it?
            euint8 columnWinner = FHE.select(columnComplete, FHE.select(FHE.eq(_board[0][i], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2), WINNER_NONE);
            // if there's already a winner from another column then it's a draw
            // because one player can't complete two columns at the same time
            ebool columnHasWinner = FHE.ne(columnWinner, WINNER_NONE);
            ebool alreadyHasWinner = FHE.ne(winner, WINNER_NONE);
            ebool isDraw = FHE.and(columnHasWinner, alreadyHasWinner);
            winner = FHE.select(isDraw, WINNER_DRAW, FHE.select(columnHasWinner, columnWinner, winner));
        }
        return winner;
    }

    function whoWinsByDiagonal(euint8[3][3] memory _board) private view returns (euint8 winner) {
        // check if any diagonal is complete
        ebool mainDiagonalEqual = FHE.and(FHE.eq(_board[0][0], _board[1][1]), FHE.eq(_board[1][1], _board[2][2]));
        ebool antiDiagonalEqual = FHE.and(FHE.eq(_board[0][2], _board[1][1]), FHE.eq(_board[1][1], _board[2][0]));
        // if the center cell is not empty and any diagonal is equal then the center cell owner is the winner
        winner = FHE.select(FHE.and(FHE.ne(_board[1][1], CELL_EMPTY), FHE.or(mainDiagonalEqual, antiDiagonalEqual)), FHE.select(FHE.eq(_board[1][1], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2), WINNER_NONE);
        return winner;
    }

    function isBoardFull(euint8[3][3] memory _board) private view returns (ebool isFull) {
        isFull = FHE.asEbool(true);
        for (uint8 i = 0; i < 3; i++) {
            for (uint8 j = 0; j < 3; j++) {
                // if any cell is empty then the board is not full
                isFull = FHE.select(FHE.eq(_board[i][j], CELL_EMPTY), FHE.asEbool(false), isFull);
            }
        }
        return isFull;
    }
}
