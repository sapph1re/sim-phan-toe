import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed = await deploy("SimTacToe", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log(`SimTacToe contract deployed at: ${deployed.address}`);
  console.log(`\nTo use with the frontend, create frontend/.env with:`);
  console.log(`VITE_SIMTACTOE_ADDRESS=${deployed.address}`);
};

export default func;
func.id = "deploy_simtactoe";
func.tags = ["SimTacToe"];

