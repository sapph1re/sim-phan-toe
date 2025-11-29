import { ethers } from "hardhat";

async function main() {
  const targetAddress = process.env.TARGET_ADDRESS || "0x6fe0E8BDAC611E9DF3334cDae26062bA621C434E";
  const amount = process.env.AMOUNT || "100";

  const [signer] = await ethers.getSigners();
  
  console.log(`Funding ${targetAddress} with ${amount} ETH...`);
  console.log(`From: ${await signer.getAddress()}`);
  
  const tx = await signer.sendTransaction({
    to: targetAddress,
    value: ethers.parseEther(amount)
  });
  
  await tx.wait();
  
  console.log(`✅ Sent ${amount} ETH to ${targetAddress}`);
  console.log(`Transaction hash: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

