// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.30;

import {FHE, ebool, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Simultaneous Phantom Tic-Tac-Toe game with FHEVM
/// @author Roman V (https://github.com/sapph1re)
/// @notice A two-player tic-tac-toe game where moves are encrypted
/// and submitted by both players to be processed simultaneously.
/// @dev Uses Zama's FHEVM for fully homomorphic encryption of game state
contract SimPhanToe is ZamaEthereumConfig {
    struct Game {
        uint256 gameId;
        address player1;
        address player2;
        euint8[4][4] eBoard; // encrypted Cells
        euint8 eWinner; // encrypted Winner produced in FHE computations, then publicly decrypted
        ebool eCollision; // encrypted flag indicating if the latest moves collided
        Cell[4][4] board; // the board is decrypted when the game finishes
        Winner winner; // decrypted winner, for convenience when UI is checking the game state
        uint256 stake; // ETH stake for the game (each player puts this amount)
        uint256 moveTimeout; // time limit for making moves
        uint256 lastActionTimestamp; // timestamp of last action requiring a response
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
        Draw,
        Cancelled // plaintext only, never used in FHE
    }

    // Timeout constants
    uint256 public constant MIN_TIMEOUT = 1 hours;
    uint256 public constant MAX_TIMEOUT = 7 days;

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

    event GameStarted(uint256 indexed gameId, address indexed player1, uint256 stake, uint256 moveTimeout);
    event PlayerJoined(uint256 indexed gameId, address indexed player2);
    event MoveSubmitted(uint256 indexed gameId, address indexed player);
    event MoveInvalid(uint256 indexed gameId, address indexed player);
    event MoveMade(uint256 indexed gameId, address indexed player);
    event MovesProcessed(uint256 indexed gameId);
    event Collision(uint256 indexed gameId);
    event GameUpdated(uint256 indexed gameId, Winner winner);
    event BoardRevealed(uint256 indexed gameId);
    event GameCancelled(uint256 indexed gameId);
    event GameTimeout(uint256 indexed gameId, address indexed winner);

    constructor() {
        CELL_EMPTY = FHE.asEuint8(uint8(Cell.Empty));
        CELL_PLAYER1 = FHE.asEuint8(uint8(Cell.Player1));
        CELL_PLAYER2 = FHE.asEuint8(uint8(Cell.Player2));
        WINNER_NONE = FHE.asEuint8(uint8(Winner.None));
        WINNER_PLAYER1 = FHE.asEuint8(uint8(Winner.Player1));
        WINNER_PLAYER2 = FHE.asEuint8(uint8(Winner.Player2));
        WINNER_DRAW = FHE.asEuint8(uint8(Winner.Draw));
        // Grant the contract permission to use these encrypted constants
        FHE.allowThis(CELL_EMPTY);
        FHE.allowThis(CELL_PLAYER1);
        FHE.allowThis(CELL_PLAYER2);
        FHE.allowThis(WINNER_NONE);
        FHE.allowThis(WINNER_PLAYER1);
        FHE.allowThis(WINNER_PLAYER2);
        FHE.allowThis(WINNER_DRAW);
    }

    /// @notice Start a new game as player 1
    /// @param _moveTimeout Time limit for each move (between MIN_TIMEOUT and MAX_TIMEOUT)
    /// @dev Initializes Game with player 1 and empty board. Send ETH to set the stake.
    function startGame(uint256 _moveTimeout) external payable {
        require(_moveTimeout >= MIN_TIMEOUT && _moveTimeout <= MAX_TIMEOUT, "Invalid timeout.");
        Game memory game = Game({
            gameId: gameCount,
            player1: msg.sender,
            player2: address(0),
            eBoard: [
                [CELL_EMPTY, CELL_EMPTY, CELL_EMPTY, CELL_EMPTY],
                [CELL_EMPTY, CELL_EMPTY, CELL_EMPTY, CELL_EMPTY],
                [CELL_EMPTY, CELL_EMPTY, CELL_EMPTY, CELL_EMPTY],
                [CELL_EMPTY, CELL_EMPTY, CELL_EMPTY, CELL_EMPTY]
            ],
            eWinner: WINNER_NONE,
            eCollision: FHE.asEbool(false),
            board: [
                [Cell.Empty, Cell.Empty, Cell.Empty, Cell.Empty],
                [Cell.Empty, Cell.Empty, Cell.Empty, Cell.Empty],
                [Cell.Empty, Cell.Empty, Cell.Empty, Cell.Empty],
                [Cell.Empty, Cell.Empty, Cell.Empty, Cell.Empty]
            ],
            winner: Winner.None,
            stake: msg.value,
            moveTimeout: _moveTimeout,
            lastActionTimestamp: 0 // Not set until player2 joins
        });
        games.push(game);
        // Grant the contract permission to use the game's encrypted values
        FHE.allowThis(games[gameCount].eWinner);
        FHE.allowThis(games[gameCount].eCollision);
        for (uint8 i = 0; i < 4; i++) {
            for (uint8 j = 0; j < 4; j++) {
                FHE.allowThis(games[gameCount].eBoard[i][j]);
            }
        }
        emit GameStarted(game.gameId, game.player1, game.stake, game.moveTimeout);
        gameCount++;
    }

    /// @notice Join a game as player 2
    /// @param _gameId The ID of the game to join
    /// @dev Must send ETH matching the game's stake
    function joinGame(uint256 _gameId) external payable {
        Game storage game = games[_gameId];
        require(game.player1 != address(0), "Game not found.");
        require(game.player2 == address(0), "Game is already full.");
        require(msg.sender != game.player1, "Cannot join your own game.");
        require(msg.value == game.stake, "Must match stake.");
        game.player2 = msg.sender;
        game.lastActionTimestamp = block.timestamp;
        emit PlayerJoined(_gameId, msg.sender);
    }

    /// @notice Submit an encrypted move
    /// @param _gameId The game ID
    /// @param _inputX Encrypted X coordinate (0-3)
    /// @param _inputY Encrypted Y coordinate (0-3)
    /// @param _inputProof ZK proof for the encrypted inputs
    /// @dev Move validity is checked in FHE; isInvalid flag is made publicly decryptable,
    /// clients should reflect the move in the UI and trigger decryption of the isInvalid flag
    /// then call finalizeMove()
    function submitMove(
        uint256 _gameId,
        externalEuint8 _inputX,
        externalEuint8 _inputY,
        bytes calldata _inputProof
    ) external {
        Game memory game = games[_gameId];
        require(game.player1 != address(0) && game.player2 != address(0), "Game has not started yet.");
        require(game.winner == Winner.None, "Game is finished.");
        require(msg.sender == game.player1 || msg.sender == game.player2, "You are not a player in this game.");
        require(!nextMoves[_gameId][msg.sender].isSubmitted, "Move already submitted.");

        euint8 x = FHE.fromExternal(_inputX, _inputProof);
        euint8 y = FHE.fromExternal(_inputY, _inputProof);

        // check if the move is valid
        ebool xValid = FHE.lt(x, 4);
        ebool yValid = FHE.lt(y, 4);
        ebool cellEmpty = FHE.eq(getCell(game.eBoard, x, y), CELL_EMPTY);
        ebool allValid = FHE.and(FHE.and(xValid, yValid), cellEmpty);

        // save the move
        Move memory move = nextMoves[_gameId][msg.sender];
        move.x = x;
        move.y = y;
        move.isSubmitted = true;
        move.isInvalid = FHE.not(allValid);
        move.isCellOccupied = FHE.not(cellEmpty);
        nextMoves[_gameId][msg.sender] = move;

        // set access permissions
        FHE.allowThis(move.x);
        FHE.allowThis(move.y);
        FHE.allowThis(move.isInvalid);
        FHE.allowThis(move.isCellOccupied);
        FHE.allow(move.x, msg.sender);
        FHE.allow(move.y, msg.sender);
        FHE.allow(move.isCellOccupied, msg.sender);
        FHE.makePubliclyDecryptable(move.isInvalid);

        emit MoveSubmitted(_gameId, msg.sender);
        // client should reflect the move submission in the UI
        // then trigger decryption of the isInvalid flag and call finalizeMove()
    }

    /// @notice Finalize a player's move after decryption of its validity
    /// @param _gameId The game ID
    /// @param _player The player whose move is being finalized
    /// @param _isInvalid The decrypted validity flag
    /// @param _decryptionProof KMS signature proving correct decryption
    /// @dev Must be called after submitting a move and decrypting the isInvalid flag
    function finalizeMove(uint256 _gameId, address _player, bool _isInvalid, bytes memory _decryptionProof) external {
        // verify decryption of the move.isInvalid flag
        Move storage move = nextMoves[_gameId][_player];
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
        // process the moves if both players have made their moves
        address player1 = games[_gameId].player1;
        address player2 = games[_gameId].player2;
        if (nextMoves[_gameId][player1].isMade && nextMoves[_gameId][player2].isMade) {
            processMoves(_gameId);
        }
    }

    /// @notice Finalize game state after winner decryption
    /// @param _gameId The game ID
    /// @param _winner The decrypted winner value
    /// @param _collision The decrypted collision flag
    /// @param _decryptionProof KMS signature proving correct decryption
    /// @dev Must be called after processing the moves and decrypting the winner value and the collision flag
    function finalizeGameState(
        uint256 _gameId,
        uint8 _winner,
        bool _collision,
        bytes memory _decryptionProof
    ) external {
        Game storage game = games[_gameId];
        require(game.winner == Winner.None, "Game already finished.");
        // verify decryption of the winner value and the collision flag
        bytes32[] memory ciphertextHandles = new bytes32[](2);
        ciphertextHandles[0] = FHE.toBytes32(game.eWinner);
        ciphertextHandles[1] = FHE.toBytes32(game.eCollision);
        bytes memory abiEncodedCleartexts = abi.encode(_winner, _collision);
        FHE.checkSignatures(ciphertextHandles, abiEncodedCleartexts, _decryptionProof);
        // if moves collided, let the players submit another move
        if (_collision) {
            game.eCollision = FHE.asEbool(false);
            FHE.allowThis(game.eCollision);
            game.lastActionTimestamp = block.timestamp;
            emit Collision(_gameId);
            return;
            // clients should reflect the collision in the UI and ask the players to submit another move
        }
        // finish the game if we have a winner
        if (_winner != uint8(Winner.None)) {
            game.winner = Winner(_winner);
            // decrypt the board
            for (uint8 i = 0; i < 4; i++) {
                for (uint8 j = 0; j < 4; j++) {
                    FHE.makePubliclyDecryptable(game.eBoard[i][j]);
                }
            }
            // distribute prizes
            _distributePrizes(_gameId);
        } else {
            // game continues, reset timestamp for next move
            game.lastActionTimestamp = block.timestamp;
        }
        emit GameUpdated(_gameId, game.winner);
        // clients should reflect the new game state, and if there's a winner,
        // trigger decryption of the board and then call revealBoard()
    }

    /// @notice Reveal the board to the UI
    /// @param _gameId The game ID
    /// @param _board The decrypted board
    /// @param _decryptionProof KMS signature proving correct decryption
    /// @dev Must be called after finalizeGameState() if the game has finished
    function revealBoard(uint256 _gameId, uint8[4][4] memory _board, bytes memory _decryptionProof) external {
        Game storage game = games[_gameId];
        require(game.winner != Winner.None, "Game is not finished.");
        // verify decryption of the board
        bytes32[] memory ciphertextHandles = new bytes32[](16);
        for (uint8 i = 0; i < 4; i++) {
            for (uint8 j = 0; j < 4; j++) {
                ciphertextHandles[i * 4 + j] = FHE.toBytes32(game.eBoard[i][j]);
            }
        }
        bytes memory abiEncodedCleartexts = abi.encode(_board);
        FHE.checkSignatures(ciphertextHandles, abiEncodedCleartexts, _decryptionProof);
        for (uint8 i = 0; i < 4; i++) {
            for (uint8 j = 0; j < 4; j++) {
                game.board[i][j] = Cell(_board[i][j]);
            }
        }
        emit BoardRevealed(_gameId);
    }

    /// @notice Cancel an unjoined game and get refund
    /// @param _gameId The game ID to cancel
    /// @dev Only player1 can cancel, and only before player2 joins
    function cancelGame(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(msg.sender == game.player1, "Only player1 can cancel.");
        require(game.player2 == address(0), "Game already has player2.");
        require(game.winner == Winner.None, "Game already finished.");

        game.winner = Winner.Cancelled;
        uint256 refund = game.stake;
        game.stake = 0;

        if (refund > 0) {
            (bool success, ) = payable(msg.sender).call{value: refund}("");
            require(success, "Transfer failed.");
        }

        emit GameCancelled(_gameId);
    }

    /// @notice Claim victory when opponent has timed out
    /// @param _gameId The game ID
    /// @dev Can be called when opponent hasn't completed their move within the timeout period
    function claimTimeout(uint256 _gameId) external {
        Game storage game = games[_gameId];
        require(game.player2 != address(0), "Game has not started.");
        require(game.winner == Winner.None, "Game already finished.");
        require(msg.sender == game.player1 || msg.sender == game.player2, "Not a player.");
        require(block.timestamp > game.lastActionTimestamp + game.moveTimeout, "Timeout not reached.");

        // Determine who timed out based on move status
        Move memory move1 = nextMoves[_gameId][game.player1];
        Move memory move2 = nextMoves[_gameId][game.player2];

        bool player1Completed = move1.isMade;
        bool player2Completed = move2.isMade;

        // If both completed or both didn't complete, it's a draw
        // If one completed and the other didn't, the one who completed wins
        Winner winner;
        if (player1Completed && !player2Completed) {
            winner = Winner.Player1;
            require(msg.sender == game.player1, "Only player1 can claim.");
        } else if (player2Completed && !player1Completed) {
            winner = Winner.Player2;
            require(msg.sender == game.player2, "Only player2 can claim.");
        } else {
            // Both timed out or both completed (shouldn't happen in normal flow)
            winner = Winner.Draw;
        }

        game.winner = winner;
        
        // Clean up moves
        delete nextMoves[_gameId][game.player1];
        delete nextMoves[_gameId][game.player2];

        // Distribute prizes
        _distributePrizes(_gameId);

        address winnerAddress = winner == Winner.Player1 ? game.player1 :
            (winner == Winner.Player2 ? game.player2 : address(0));
        emit GameTimeout(_gameId, winnerAddress);
    }

    /// @notice Distribute prizes based on game outcome
    /// @param _gameId The game ID
    function _distributePrizes(uint256 _gameId) private {
        Game storage game = games[_gameId];
        uint256 totalStake = game.stake * 2;
        
        if (totalStake == 0) return;

        // Clear stake to prevent re-entrancy
        game.stake = 0;

        if (game.winner == Winner.Player1) {
            (bool success, ) = payable(game.player1).call{value: totalStake}("");
            require(success, "Transfer failed.");
        } else if (game.winner == Winner.Player2) {
            (bool success, ) = payable(game.player2).call{value: totalStake}("");
            require(success, "Transfer failed.");
        } else if (game.winner == Winner.Draw) {
            // Split evenly
            uint256 half = totalStake / 2;
            (bool success1, ) = payable(game.player1).call{value: half}("");
            require(success1, "Transfer to player1 failed.");
            (bool success2, ) = payable(game.player2).call{value: totalStake - half}("");
            require(success2, "Transfer to player2 failed.");
        }
        // Winner.Cancelled is handled separately in cancelGame
    }

    /// @notice Get game data
    /// @param _gameId The game ID
    /// @return Game struct
    function getGame(uint256 _gameId) external view returns (Game memory) {
        return games[_gameId];
    }

    /// @notice Get all games waiting for a second player
    /// @return Array of game IDs
    function getOpenGames() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].player2 == address(0) && games[i].winner == Winner.None) {
                count++;
            }
        }
        uint256[] memory openGames = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < gameCount; i++) {
            if (games[i].player2 == address(0) && games[i].winner == Winner.None) {
                openGames[index] = i;
                index++;
            }
        }
        return openGames;
    }

    /// @notice Get all games a player is participating in
    /// @param _player The player's address
    /// @return Array of game IDs
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

    /// @notice Get the move status for both players
    /// @param _gameId The game ID
    /// @return move1 Player 1's move
    /// @return move2 Player 2's move
    function getMoves(uint256 _gameId) external view returns (Move memory move1, Move memory move2) {
        Game memory game = games[_gameId];
        return (nextMoves[_gameId][game.player1], nextMoves[_gameId][game.player2]);
    }

    /// @notice Check if a player can submit a move
    /// @param _gameId The game ID
    /// @param _player The player address
    /// @return canSubmit Whether the player can submit a move now
    function canSubmitMove(uint256 _gameId, address _player) external view returns (bool canSubmit) {
        Game memory game = games[_gameId];
        if (game.player2 == address(0)) return false; // waiting for player 2
        if (game.winner != Winner.None) return false; // game already finished
        if (_player != game.player1 && _player != game.player2) return false;
        return !nextMoves[_gameId][_player].isSubmitted;
    }

    /// @notice When both moves are submitted, process them and update the game state
    /// @param _gameId The game ID
    /// @dev Trigger decryption of the winner value and the collision flag, then call finalizeGameState()
    function processMoves(uint256 _gameId) private {
        Game storage game = games[_gameId];
        Move memory moveOne = nextMoves[_gameId][game.player1];
        Move memory moveTwo = nextMoves[_gameId][game.player2];
        // check for collision
        game.eCollision = FHE.and(FHE.eq(moveOne.x, moveTwo.x), FHE.eq(moveOne.y, moveTwo.y));
        FHE.allowThis(game.eCollision);
        FHE.makePubliclyDecryptable(game.eCollision);
        // set the cells according to the moves or don't change anything if they collided
        setCell(game.eBoard, moveOne.x, moveOne.y, FHE.select(game.eCollision, CELL_EMPTY, CELL_PLAYER1));
        setCell(game.eBoard, moveTwo.x, moveTwo.y, FHE.select(game.eCollision, CELL_EMPTY, CELL_PLAYER2));
        // technically, if there's a collision no move is made so there's no point in checking the winner,
        // but because we cannot really branch the logic in FHE I guess we can just afford to run it anyways
        game.eWinner = whoWins(_gameId);
        FHE.allowThis(game.eWinner);
        FHE.makePubliclyDecryptable(game.eWinner);
        // free nextMoves
        delete nextMoves[_gameId][game.player1];
        delete nextMoves[_gameId][game.player2];
        emit MovesProcessed(_gameId);
        // clients should trigger decryption of the winner and the collision flag,
        // reflect the situation accordingly in the UI and call finalizeGameState()
    }

    /// @notice Write to a cell in the board in FHE
    function setCell(euint8[4][4] storage _board, euint8 _x, euint8 _y, euint8 _cell) private {
        // Precompute coordinate comparisons to reduce FHE operations from 64 to 40
        ebool[4] memory xMatches;
        for (uint8 j = 0; j < 4; j++) {
            xMatches[j] = FHE.eq(_x, j);
        }
        for (uint8 i = 0; i < 4; i++) {
            ebool yMatch = FHE.eq(_y, i);
            for (uint8 j = 0; j < 4; j++) {
                _board[i][j] = FHE.select(FHE.and(yMatch, xMatches[j]), _cell, _board[i][j]);
                FHE.allowThis(_board[i][j]);
            }
        }
    }

    /// @notice Read a cell in the board in FHE
    function getCell(euint8[4][4] memory _board, euint8 _x, euint8 _y) private returns (euint8 cell) {
        // Precompute coordinate comparisons to reduce FHE operations from 64 to 40
        ebool[4] memory xMatches;
        for (uint8 j = 0; j < 4; j++) {
            xMatches[j] = FHE.eq(_x, j);
        }
        for (uint8 i = 0; i < 4; i++) {
            ebool yMatch = FHE.eq(_y, i);
            for (uint8 j = 0; j < 4; j++) {
                cell = FHE.select(FHE.and(yMatch, xMatches[j]), _board[i][j], cell);
            }
        }
        return cell;
    }

    /// @notice Determine if there's a winner
    /// @param _gameId The game ID
    /// @return winner Encrypted Winner enum value
    function whoWins(uint256 _gameId) private returns (euint8 winner) {
        Game memory game = games[_gameId];
        euint8[4][4] memory board = game.eBoard;
        // check each row, column and diagonal for winners
        euint8 winnerRow = whoWinsByRow(board);
        euint8 winnerColumn = whoWinsByColumn(board);
        euint8 winnerDiagonal = whoWinsByDiagonal(board);
        // if we have a draw on any of them then it's a draw
        ebool isDraw = FHE.or(
            FHE.or(FHE.eq(winnerRow, WINNER_DRAW), FHE.eq(winnerColumn, WINNER_DRAW)),
            FHE.eq(winnerDiagonal, WINNER_DRAW)
        );
        // check if either player has won
        ebool player1Wins = FHE.or(
            FHE.or(FHE.eq(winnerRow, WINNER_PLAYER1), FHE.eq(winnerColumn, WINNER_PLAYER1)),
            FHE.eq(winnerDiagonal, WINNER_PLAYER1)
        );
        ebool player2Wins = FHE.or(
            FHE.or(FHE.eq(winnerRow, WINNER_PLAYER2), FHE.eq(winnerColumn, WINNER_PLAYER2)),
            FHE.eq(winnerDiagonal, WINNER_PLAYER2)
        );
        // if both won it's a draw
        isDraw = FHE.or(isDraw, FHE.and(player1Wins, player2Wins));
        // if no one is winning then check if the board is full
        ebool noWinners = FHE.and(FHE.and(FHE.not(player1Wins), FHE.not(player2Wins)), FHE.not(isDraw));
        isDraw = FHE.or(isDraw, FHE.and(noWinners, isBoardFull(board)));
        // return draw, none or winner
        winner = FHE.select(
            isDraw,
            WINNER_DRAW,
            FHE.select(noWinners, WINNER_NONE, FHE.select(player1Wins, WINNER_PLAYER1, WINNER_PLAYER2))
        );
        return winner;
    }

    /// @notice Determine if there's a winner in any row
    /// @param _board The board
    /// @return winner Encrypted Winner enum value
    function whoWinsByRow(euint8[4][4] memory _board) private returns (euint8 winner) {
        winner = WINNER_NONE;
        for (uint8 i = 0; i < 4; i++) {
            // check each row if it's complete
            ebool rowComplete = FHE.and(
                FHE.and(
                    FHE.and(FHE.eq(_board[i][0], _board[i][1]), FHE.eq(_board[i][1], _board[i][2])),
                    FHE.eq(_board[i][2], _board[i][3])
                ),
                FHE.ne(_board[i][0], CELL_EMPTY)
            );
            // whose row is it?
            euint8 rowWinner = FHE.select(
                rowComplete,
                FHE.select(FHE.eq(_board[i][0], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2),
                WINNER_NONE
            );
            // if there's already a winner from another row then it's a draw
            // one player can't complete two rows at the same time, because
            // it would require two moves and the game would have already finished.
            ebool rowHasWinner = FHE.ne(rowWinner, WINNER_NONE);
            ebool alreadyHasWinner = FHE.ne(winner, WINNER_NONE);
            ebool isDraw = FHE.and(rowHasWinner, alreadyHasWinner);
            winner = FHE.select(isDraw, WINNER_DRAW, FHE.select(rowHasWinner, rowWinner, winner));
        }
        return winner;
    }

    /// @notice Determine if there's a winner in any column
    /// @param _board The board
    /// @return winner Encrypted Winner enum value
    function whoWinsByColumn(euint8[4][4] memory _board) private returns (euint8 winner) {
        winner = WINNER_NONE;
        for (uint8 i = 0; i < 4; i++) {
            // check each column if it's complete
            ebool columnComplete = FHE.and(
                FHE.and(
                    FHE.and(FHE.eq(_board[0][i], _board[1][i]), FHE.eq(_board[1][i], _board[2][i])),
                    FHE.eq(_board[2][i], _board[3][i])
                ),
                FHE.ne(_board[0][i], CELL_EMPTY)
            );
            // whose column is it?
            euint8 columnWinner = FHE.select(
                columnComplete,
                FHE.select(FHE.eq(_board[0][i], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2),
                WINNER_NONE
            );
            // if there's already a winner from another column then it's a draw:
            // one player can't complete two columns at the same time, because
            // it would require two moves and the game would have already finished.
            ebool columnHasWinner = FHE.ne(columnWinner, WINNER_NONE);
            ebool alreadyHasWinner = FHE.ne(winner, WINNER_NONE);
            ebool isDraw = FHE.and(columnHasWinner, alreadyHasWinner);
            winner = FHE.select(isDraw, WINNER_DRAW, FHE.select(columnHasWinner, columnWinner, winner));
        }
        return winner;
    }

    /// @notice Determine if there's a winner in any diagonal
    /// @param _board The board
    /// @return winner Encrypted Winner enum value
    function whoWinsByDiagonal(euint8[4][4] memory _board) private returns (euint8 winner) {
        // check if any diagonal is complete
        ebool mainDiagonalEqual = FHE.and(
            FHE.and(
                FHE.and(FHE.eq(_board[0][0], _board[1][1]), FHE.eq(_board[1][1], _board[2][2])),
                FHE.eq(_board[2][2], _board[3][3])
            ),
            FHE.ne(_board[0][0], CELL_EMPTY)
        );
        ebool antiDiagonalEqual = FHE.and(
            FHE.and(
                FHE.and(FHE.eq(_board[0][3], _board[1][2]), FHE.eq(_board[1][2], _board[2][1])),
                FHE.eq(_board[2][1], _board[3][0])
            ),
            FHE.ne(_board[0][3], CELL_EMPTY)
        );
        // who wins which diagonal?
        euint8 mainDiagonalWinner = FHE.select(
            mainDiagonalEqual,
            FHE.select(FHE.eq(_board[0][0], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2),
            WINNER_NONE
        );
        euint8 antiDiagonalWinner = FHE.select(
            antiDiagonalEqual,
            FHE.select(FHE.eq(_board[0][3], CELL_PLAYER1), WINNER_PLAYER1, WINNER_PLAYER2),
            WINNER_NONE
        );
        // if both players won a diagonal then it's a draw
        ebool isDraw = FHE.and(FHE.ne(mainDiagonalWinner, WINNER_NONE), FHE.ne(antiDiagonalWinner, WINNER_NONE));
        winner = FHE.select(
            isDraw,
            WINNER_DRAW,
            // if main is winner, return main, otherwise return anti (it's either a winner or none)
            FHE.select(FHE.ne(mainDiagonalWinner, WINNER_NONE), mainDiagonalWinner, antiDiagonalWinner)
        );
        return winner;
    }

    /// @notice Determine if the board is full
    /// @param _board The board
    /// @return isFull Encrypted boolean value
    function isBoardFull(euint8[4][4] memory _board) private returns (ebool isFull) {
        isFull = FHE.asEbool(true);
        for (uint8 i = 0; i < 4; i++) {
            for (uint8 j = 0; j < 4; j++) {
                // board is full only if all cells are non-empty
                isFull = FHE.and(isFull, FHE.ne(_board[i][j], CELL_EMPTY));
            }
        }
        return isFull;
    }
}
