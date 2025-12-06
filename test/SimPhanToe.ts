import { SimPhanToe, SimPhanToe__factory } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

type Signers = {
  deployer: HardhatEthersSigner;
  player1: HardhatEthersSigner;
  player2: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("SimPhanToe")) as SimPhanToe__factory;
  const contract = (await factory.deploy()) as SimPhanToe;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("SimPhanToe", function () {
  let signers: Signers;
  let contract: SimPhanToe;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], player1: ethSigners[1], player2: ethSigners[2] };
  });

  beforeEach(async () => {
    ({ contract, contractAddress } = await deployFixture());
  });

  // ==================== DEPLOYMENT TESTS ====================

  describe("Deployment", function () {
    it("should be deployed successfully", async function () {
      expect(ethers.isAddress(contractAddress)).to.eq(true);
    });

    it("should have zero game count after deployment", async function () {
      const gameCount = await contract.gameCount();
      expect(gameCount).to.eq(0n);
    });
  });

  // ==================== GAME CREATION TESTS ====================

  describe("Game Creation", function () {
    it("should allow a player to start a new game", async function () {
      const tx = await contract.connect(signers.player1).startGame();
      await tx.wait();

      const gameCount = await contract.gameCount();
      expect(gameCount).to.eq(1n);
    });

    it("should emit GameStarted event when starting a game", async function () {
      await expect(contract.connect(signers.player1).startGame())
        .to.emit(contract, "GameStarted")
        .withArgs(0n, signers.player1.address);
    });

    it("should add the game to open games list", async function () {
      await contract.connect(signers.player1).startGame();

      const openGames = await contract.getOpenGames();
      expect(openGames.length).to.eq(1);
      expect(openGames[0]).to.eq(0n);
    });

    it("should track games by player", async function () {
      await contract.connect(signers.player1).startGame();

      const playerGames = await contract.getGamesByPlayer(signers.player1.address);
      expect(playerGames.length).to.eq(1);
      expect(playerGames[0]).to.eq(0n);
    });

    it("should set player1 correctly in the game", async function () {
      await contract.connect(signers.player1).startGame();

      const game = await contract.getGame(0);
      expect(game.player1).to.eq(signers.player1.address);
      expect(game.player2).to.eq(ethers.ZeroAddress);
      expect(game.winner).to.eq(0n); // Winner.None = 0
    });
  });

  // ==================== GAME JOIN TESTS ====================

  describe("Game Join", function () {
    beforeEach(async function () {
      // Create a game for player 1
      await contract.connect(signers.player1).startGame();
    });

    it("should allow player2 to join an open game", async function () {
      const tx = await contract.connect(signers.player2).joinGame(0);
      await tx.wait();

      const game = await contract.getGame(0);
      expect(game.player2).to.eq(signers.player2.address);
    });

    it("should emit PlayerJoined event when joining a game", async function () {
      await expect(contract.connect(signers.player2).joinGame(0))
        .to.emit(contract, "PlayerJoined")
        .withArgs(0n, signers.player2.address);
    });

    it("should remove the game from open games list after player2 joins", async function () {
      await contract.connect(signers.player2).joinGame(0);

      const openGames = await contract.getOpenGames();
      expect(openGames.length).to.eq(0);
    });

    it("should track games by player for player2", async function () {
      await contract.connect(signers.player2).joinGame(0);

      const playerGames = await contract.getGamesByPlayer(signers.player2.address);
      expect(playerGames.length).to.eq(1);
      expect(playerGames[0]).to.eq(0n);
    });

    it("should not allow player1 to join their own game", async function () {
      await expect(contract.connect(signers.player1).joinGame(0)).to.be.revertedWith("Cannot join your own game.");
    });

    it("should not allow joining a full game", async function () {
      await contract.connect(signers.player2).joinGame(0);

      await expect(contract.connect(signers.deployer).joinGame(0)).to.be.revertedWith("Game is already full.");
    });
  });

  // ==================== MOVE SUBMISSION TESTS ====================

  describe("Move Submission", function () {
    beforeEach(async function () {
      // Create and join a game
      await contract.connect(signers.player1).startGame();
      await contract.connect(signers.player2).joinGame(0);
    });

    it("should allow canSubmitMove to return true before moves are made", async function () {
      const canSubmitP1 = await contract.canSubmitMove(0, signers.player1.address);
      const canSubmitP2 = await contract.canSubmitMove(0, signers.player2.address);

      expect(canSubmitP1).to.eq(true);
      expect(canSubmitP2).to.eq(true);
    });

    it("should allow player1 to submit an encrypted move", async function () {
      // Encrypt move coordinates (0, 0)
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0) // x coordinate
        .add8(0) // y coordinate
        .encrypt();

      const tx = await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof);
      await tx.wait();

      // Check that move was submitted
      const [move1] = await contract.getMoves(0);
      expect(move1.isSubmitted).to.eq(true);
      expect(move1.isMade).to.eq(false); // Not yet finalized
    });

    it("should emit MoveSubmitted event when submitting a move", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await expect(
        contract
          .connect(signers.player1)
          .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof),
      )
        .to.emit(contract, "MoveSubmitted")
        .withArgs(0n, signers.player1.address);
    });

    it("should set canSubmitMove to false after submitting a move", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof);

      const canSubmit = await contract.canSubmitMove(0, signers.player1.address);
      expect(canSubmit).to.eq(false);
    });

    it("should not allow submitting a move twice", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(1)
        .add8(1)
        .encrypt();

      await expect(
        contract
          .connect(signers.player1)
          .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof),
      ).to.be.revertedWith("Move already submitted.");
    });

    it("should not allow non-players to submit moves", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.deployer.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await expect(
        contract
          .connect(signers.deployer)
          .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof),
      ).to.be.revertedWith("You are not a player in this game.");
    });
  });

  // ==================== MOVE FINALIZATION TESTS ====================

  describe("Move Finalization", function () {
    beforeEach(async function () {
      // Create and join a game
      await contract.connect(signers.player1).startGame();
      await contract.connect(signers.player2).joinGame(0);
    });

    it("should finalize a valid move after decryption", async function () {
      // Submit move for player1
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof);

      // Get the move to access the isInvalid handle
      const [move1] = await contract.getMoves(0);

      // Decrypt the isInvalid flag using public decryption
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([move1.isInvalid]);
      const isInvalid = clearValues[move1.isInvalid as `0x${string}`] as boolean;

      // Finalize the move (isInvalid should be false for a valid move)
      const tx = await contract.finalizeMove(0, signers.player1.address, isInvalid, decryptionProof);
      await tx.wait();

      // Check move was finalized
      const [updatedMove1] = await contract.getMoves(0);
      expect(updatedMove1.isMade).to.eq(true);
    });

    it("should emit MoveMade event when finalizing a valid move", async function () {
      const encryptedMove = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove.handles[0], encryptedMove.handles[1], encryptedMove.inputProof);

      const [move1] = await contract.getMoves(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([move1.isInvalid]);
      const isInvalid = clearValues[move1.isInvalid as `0x${string}`] as boolean;

      await expect(contract.finalizeMove(0, signers.player1.address, isInvalid, decryptionProof))
        .to.emit(contract, "MoveMade")
        .withArgs(0n, signers.player1.address);
    });
  });

  // ==================== MOVE PROCESSING TESTS ====================

  describe("Move Processing", function () {
    beforeEach(async function () {
      await contract.connect(signers.player1).startGame();
      await contract.connect(signers.player2).joinGame(0);
    });

    it("should process moves when both players have finalized", async function () {
      // Player 1 submits move at (0, 0)
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      // Player 2 submits move at (1, 1)
      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(1)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize player 1's move
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      // Finalize player 2's move - this should trigger processMoves
      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;

      await expect(contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2))
        .to.emit(contract, "MovesProcessed")
        .withArgs(0n);
    });
  });

  // ==================== COLLISION TESTS ====================

  describe("Collision Detection", function () {
    beforeEach(async function () {
      await contract.connect(signers.player1).startGame();
      await contract.connect(signers.player2).joinGame(0);
    });

    it("should detect collision when both players choose the same cell", async function () {
      // Both players submit move at (1, 1)
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(1)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(1)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize both moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Get game state and check collision flag
      const game = await contract.getGame(0);

      // Decrypt winner and collision for finalizeGameState
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;

      // Finalize game state - should emit Collision event
      await expect(contract.finalizeGameState(0, winner, collision, decryptionProof))
        .to.emit(contract, "Collision")
        .withArgs(0n);
    });
  });

  // ==================== WIN DETECTION TESTS ====================

  describe("Win Detection", function () {
    // Increase timeout for FHE-heavy win detection tests (especially during coverage)
    this.timeout(120000);

    beforeEach(async function () {
      await contract.connect(signers.player1).startGame();
      await contract.connect(signers.player2).joinGame(0);
    });

    // Helper function to submit and finalize moves for both players
    async function submitAndFinalizeMoves(p1x: number, p1y: number, p2x: number, p2y: number): Promise<void> {
      // Player 1 submits move
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(p1x)
        .add8(p1y)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      // Player 2 submits move
      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(p2x)
        .add8(p2y)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize player 1's move
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      // Finalize player 2's move
      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state
      const game = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;
      await contract.finalizeGameState(0, winner, collision, decryptionProof);
    }

    it("should detect player1 row win", async function () {
      // 4x4 board: Player 1 fills first row: (0,0), (1,0), (2,0), (3,0)
      // Player 2 plays scattered positions that don't complete any line: (0,1), (1,2), (2,3), (3,1)

      // Round 1: P1 at (0,0), P2 at (0,1)
      await submitAndFinalizeMoves(0, 0, 0, 1);

      // Round 2: P1 at (1,0), P2 at (1,2)
      await submitAndFinalizeMoves(1, 0, 1, 2);

      // Round 3: P1 at (2,0), P2 at (2,3)
      await submitAndFinalizeMoves(2, 0, 2, 3);

      // Round 4: P1 at (3,0), P2 at (3,1) - P1 wins with first row
      // Player 1 submits move
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(3)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      // Player 2 submits move
      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(3)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state and check for Player1 win (Winner.Player1 = 1)
      const game = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;

      await expect(contract.finalizeGameState(0, winner, collision, decryptionProof))
        .to.emit(contract, "GameUpdated")
        .withArgs(0n, 1n); // Winner.Player1 = 1

      const finalGame = await contract.getGame(0);
      expect(finalGame.winner).to.eq(1n); // Winner.Player1 = 1
    });

    it("should detect player2 column win", async function () {
      // 4x4 board: Player 2 fills first column: (0,0), (0,1), (0,2), (0,3)
      // Player 1 plays scattered positions that don't complete any line

      // Round 1: P1 at (1,0), P2 at (0,0)
      await submitAndFinalizeMoves(1, 0, 0, 0);

      // Round 2: P1 at (2,0), P2 at (0,1)
      await submitAndFinalizeMoves(2, 0, 0, 1);

      // Round 3: P1 at (3,0), P2 at (0,2)
      await submitAndFinalizeMoves(3, 0, 0, 2);

      // Round 4: P1 at (1,1), P2 at (0,3) - P2 wins with first column
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(1)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(0)
        .add8(3)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state and check for Player2 win (Winner.Player2 = 2)
      const game = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;

      await expect(contract.finalizeGameState(0, winner, collision, decryptionProof))
        .to.emit(contract, "GameUpdated")
        .withArgs(0n, 2n); // Winner.Player2 = 2

      const finalGame = await contract.getGame(0);
      expect(finalGame.winner).to.eq(2n); // Winner.Player2 = 2
    });

    it("should detect player1 main diagonal win", async function () {
      // 4x4 board: Player 1 fills main diagonal: (0,0), (1,1), (2,2), (3,3)
      // Player 2 plays positions that don't complete any line

      // Round 1: P1 at (0,0), P2 at (1,0)
      await submitAndFinalizeMoves(0, 0, 1, 0);

      // Round 2: P1 at (1,1), P2 at (2,0)
      await submitAndFinalizeMoves(1, 1, 2, 0);

      // Round 3: P1 at (2,2), P2 at (3,0)
      await submitAndFinalizeMoves(2, 2, 3, 0);

      // Round 4: P1 at (3,3), P2 at (0,1) - P1 wins with main diagonal
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(3)
        .add8(3)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(0)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state
      const game = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;

      await expect(contract.finalizeGameState(0, winner, collision, decryptionProof))
        .to.emit(contract, "GameUpdated")
        .withArgs(0n, 1n); // Winner.Player1 = 1

      const finalGame = await contract.getGame(0);
      expect(finalGame.winner).to.eq(1n); // Winner.Player1 = 1
    });

    it("should detect player1 anti-diagonal win", async function () {
      // 4x4 board: Player 1 fills anti-diagonal: (3,0), (2,1), (1,2), (0,3)
      // Player 2 plays positions that don't complete any line

      // Round 1: P1 at (3,0), P2 at (0,0)
      await submitAndFinalizeMoves(3, 0, 0, 0);

      // Round 2: P1 at (2,1), P2 at (0,1)
      await submitAndFinalizeMoves(2, 1, 0, 1);

      // Round 3: P1 at (1,2), P2 at (0,2)
      await submitAndFinalizeMoves(1, 2, 0, 2);

      // Round 4: P1 at (0,3), P2 at (1,0) - P1 wins with anti-diagonal
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(3)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(1)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state
      const game = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;

      await expect(contract.finalizeGameState(0, winner, collision, decryptionProof))
        .to.emit(contract, "GameUpdated")
        .withArgs(0n, 1n); // Winner.Player1 = 1

      const finalGame = await contract.getGame(0);
      expect(finalGame.winner).to.eq(1n); // Winner.Player1 = 1
    });
  });

  // ==================== BOARD REVEAL TESTS ====================

  describe("Board Reveal", function () {
    // Increase timeout for FHE-heavy board reveal tests (especially during coverage)
    this.timeout(120000);

    beforeEach(async function () {
      await contract.connect(signers.player1).startGame();
      await contract.connect(signers.player2).joinGame(0);
    });

    // Helper function to submit and finalize moves for both players
    async function submitAndFinalizeMoves(p1x: number, p1y: number, p2x: number, p2y: number): Promise<void> {
      // Player 1 submits move
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(p1x)
        .add8(p1y)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      // Player 2 submits move
      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(p2x)
        .add8(p2y)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize player 1's move
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      // Finalize player 2's move
      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state
      const game = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([game.eWinner, game.eCollision]);
      const winner = clearValues[game.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[game.eCollision as `0x${string}`] as boolean;
      await contract.finalizeGameState(0, winner, collision, decryptionProof);
    }

    it("should reveal board after game finishes with a winner", async function () {
      // Play a game where player 1 wins with a row
      // Round 1: P1 at (0,0), P2 at (0,1)
      await submitAndFinalizeMoves(0, 0, 0, 1);

      // Round 2: P1 at (1,0), P2 at (1,2)
      await submitAndFinalizeMoves(1, 0, 1, 2);

      // Round 3: P1 at (2,0), P2 at (2,3)
      await submitAndFinalizeMoves(2, 0, 2, 3);

      // Round 4: P1 at (3,0), P2 at (3,1) - P1 wins
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(3)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(3)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // Finalize moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // Finalize game state
      const game = await contract.getGame(0);
      const { clearValues: gameStateValues, decryptionProof: gameStateProof } = await fhevm.publicDecrypt([
        game.eWinner,
        game.eCollision,
      ]);
      const winner = gameStateValues[game.eWinner as `0x${string}`] as bigint;
      const collision = gameStateValues[game.eCollision as `0x${string}`] as boolean;
      await contract.finalizeGameState(0, winner, collision, gameStateProof);

      // Verify game is finished
      const finishedGame = await contract.getGame(0);
      expect(finishedGame.winner).to.eq(1n); // Player 1 wins

      // Decrypt and reveal the board
      const boardHandles: `0x${string}`[] = [];
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          boardHandles.push(finishedGame.eBoard[i][j] as `0x${string}`);
        }
      }

      const { clearValues: boardValues, decryptionProof: boardProof } = await fhevm.publicDecrypt(boardHandles);

      // Build the board array for revealBoard
      const board: number[][] = [];
      for (let i = 0; i < 4; i++) {
        board[i] = [];
        for (let j = 0; j < 4; j++) {
          board[i][j] = Number(boardValues[finishedGame.eBoard[i][j] as `0x${string}`]);
        }
      }

      // Call revealBoard
      await expect(
        contract.revealBoard(
          0,
          board as [
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
          ],
          boardProof,
        ),
      )
        .to.emit(contract, "BoardRevealed")
        .withArgs(0n);

      // Verify the revealed board
      const revealedGame = await contract.getGame(0);

      // Check P1's winning row (y=0)
      expect(revealedGame.board[0][0]).to.eq(1n); // Player1 at (0,0)
      expect(revealedGame.board[0][1]).to.eq(1n); // Player1 at (1,0)
      expect(revealedGame.board[0][2]).to.eq(1n); // Player1 at (2,0)
      expect(revealedGame.board[0][3]).to.eq(1n); // Player1 at (3,0)

      // Check some of P2's positions
      expect(revealedGame.board[1][0]).to.eq(2n); // Player2 at (0,1)
      expect(revealedGame.board[2][1]).to.eq(2n); // Player2 at (1,2)
      expect(revealedGame.board[3][2]).to.eq(2n); // Player2 at (2,3)
      expect(revealedGame.board[1][3]).to.eq(2n); // Player2 at (3,1)
    });

    it("should not allow revealing board before game finishes", async function () {
      // Try to reveal board before game is finished
      const game = await contract.getGame(0);

      // Create dummy board data
      const dummyBoard: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
      ] = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];

      await expect(contract.revealBoard(0, dummyBoard, "0x")).to.be.revertedWith("Game is not finished.");
    });
  });

  // ==================== INTEGRATION TEST ====================

  describe("Full Game Flow", function () {
    it("should complete a full game from start to finish", async function () {
      // 1. Start game
      await contract.connect(signers.player1).startGame();
      expect(await contract.gameCount()).to.eq(1n);

      // 2. Join game
      await contract.connect(signers.player2).joinGame(0);
      const game = await contract.getGame(0);
      expect(game.player2).to.eq(signers.player2.address);

      // 3. Both players can submit moves
      expect(await contract.canSubmitMove(0, signers.player1.address)).to.eq(true);
      expect(await contract.canSubmitMove(0, signers.player2.address)).to.eq(true);

      // 4. Submit encrypted moves
      const encryptedMove1 = await fhevm
        .createEncryptedInput(contractAddress, signers.player1.address)
        .add8(0)
        .add8(0)
        .encrypt();

      await contract
        .connect(signers.player1)
        .submitMove(0, encryptedMove1.handles[0], encryptedMove1.handles[1], encryptedMove1.inputProof);

      const encryptedMove2 = await fhevm
        .createEncryptedInput(contractAddress, signers.player2.address)
        .add8(1)
        .add8(1)
        .encrypt();

      await contract
        .connect(signers.player2)
        .submitMove(0, encryptedMove2.handles[0], encryptedMove2.handles[1], encryptedMove2.inputProof);

      // 5. Finalize moves
      const [move1Before] = await contract.getMoves(0);
      const { clearValues: clearValues1, decryptionProof: proof1 } = await fhevm.publicDecrypt([move1Before.isInvalid]);
      const isInvalid1 = clearValues1[move1Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player1.address, isInvalid1, proof1);

      const [, move2Before] = await contract.getMoves(0);
      const { clearValues: clearValues2, decryptionProof: proof2 } = await fhevm.publicDecrypt([move2Before.isInvalid]);
      const isInvalid2 = clearValues2[move2Before.isInvalid as `0x${string}`] as boolean;
      await contract.finalizeMove(0, signers.player2.address, isInvalid2, proof2);

      // 6. Finalize game state
      const gameAfterMoves = await contract.getGame(0);
      const { clearValues, decryptionProof } = await fhevm.publicDecrypt([
        gameAfterMoves.eWinner,
        gameAfterMoves.eCollision,
      ]);
      const winner = clearValues[gameAfterMoves.eWinner as `0x${string}`] as bigint;
      const collision = clearValues[gameAfterMoves.eCollision as `0x${string}`] as boolean;
      await contract.finalizeGameState(0, winner, collision, decryptionProof);

      // 7. Game should not be finished yet (no winner after 1 round)
      const finalGame = await contract.getGame(0);
      expect(finalGame.winner).to.eq(0n); // Winner.None = 0
    });
  });
});
