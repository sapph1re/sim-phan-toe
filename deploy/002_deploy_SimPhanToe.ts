import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployed = await deploy("SimPhanToe", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log(`SimPhanToe contract deployed at: ${deployed.address}`);
  console.log(`\nTo use with the frontend, create frontend/simphantoe/.env with:`);
  console.log(`VITE_SIMPHANTOE_ADDRESS=${deployed.address}`);
};

export default func;
func.id = "deploy_simphantoe";
func.tags = ["SimPhanToe"];
