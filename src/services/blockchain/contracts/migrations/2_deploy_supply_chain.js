const SupplyChain = artifacts.require("SupplyChain");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(SupplyChain).then(() => {
    console.log("SupplyChain contract deployed at:", SupplyChain.address);
    console.log("Contract deployed by:", accounts[0]);
    
    // Save contract address to environment for backend use
    if (network !== 'test') {
      console.log("Add this to your .env file:");
      console.log(`SUPPLY_CHAIN_CONTRACT_ADDRESS=${SupplyChain.address}`);
    }
  });
};