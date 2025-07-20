const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    
    // Ethereum Mainnet
    mainnet: {
      provider: () => new HDWalletProvider(
        process.env.BLOCKCHAIN_PRIVATE_KEY,
        `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      ),
      network_id: 1,
      gas: 5500000,
      gasPrice: 20000000000, // 20 gwei
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    
    // Ethereum Sepolia Testnet
    sepolia: {
      provider: () => new HDWalletProvider(
        process.env.BLOCKCHAIN_PRIVATE_KEY,
        `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      ),
      network_id: 11155111,
      gas: 5500000,
      gasPrice: 10000000000, // 10 gwei
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    
    // Polygon Mainnet
    polygon: {
      provider: () => new HDWalletProvider(
        process.env.BLOCKCHAIN_PRIVATE_KEY,
        `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      ),
      network_id: 137,
      gas: 5500000,
      gasPrice: 30000000000, // 30 gwei
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    },
    
    // Polygon Mumbai Testnet
    mumbai: {
      provider: () => new HDWalletProvider(
        process.env.BLOCKCHAIN_PRIVATE_KEY,
        `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
      ),
      network_id: 80001,
      gas: 5500000,
      gasPrice: 10000000000, // 10 gwei
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },
  
  mocha: {
    timeout: 100000
  },
  
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "byzantium"
      }
    }
  },
  
  plugins: [
    'truffle-plugin-verify'
  ],
  
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
    polygonscan: process.env.POLYGONSCAN_API_KEY
  }
};