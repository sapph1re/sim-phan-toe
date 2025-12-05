import { ethers } from "hardhat";

async function main() {
  const contract = await ethers.getContractAt('SimPhanToe', '0xda70dc4AA88DEcD0edE470c3481b67D0D8c0B03F');
  console.log('Game count:', (await contract.gameCount()).toString());
  console.log('Open games:', await contract.getOpenGames());
  const player = '0x6fe0E8BDAC611E9DF3334cDae26062bA621C434E';
  console.log('Player games:', await contract.getGamesByPlayer(player));
}

main().catch(console.error);
