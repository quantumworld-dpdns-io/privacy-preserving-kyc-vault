import Web3 from 'web3';
import { logger } from '../logger/index.js';
import { cache } from '../utils/cache.js';
import { CircuitBreaker } from '../circuitBreaker/index.js';

// Web3 provider configurations
const web3Providers = {
  ethereum: new Web3(process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/' + process.env.INFURA_PROJECT_ID),
  polygon: new Web3(process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.infura.io/v3/' + process.env.INFURA_PROJECT_ID),
  bsc: new Web3(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'),
  arbitrum: new Web3(process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'),
};

// Circuit breaker for Web3 APIs
const web3Breaker = new CircuitBreaker({
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

class Web3Adapter {
  /**
   * Get balance of an Ethereum address
   * @param {string} address - Ethereum address
   * @param {string} network - Network name (ethereum, polygon, bsc, arbitrum)
   * @returns {Promise<string>} Balance in wei
   */
  async getBalance(address, network = 'ethereum') {
    const cacheKey = `web3:${network}:balance:${address}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Web3 balance: ${cacheKey}`);
      return cached;
    }

    try {
      const web3 = web3Providers[network];
      if (!web3) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const balance = await web3Breaker.fire(async () => {
        return await web3.eth.getBalance(address);
      });
      
      // Cache for 1 minute (balances can change frequently)
      await cache.set(cacheKey, balance.toString(), 60);
      logger.info(`Retrieved ${network} balance for address: ${address}`);
      return balance.toString();
    } catch (error) {
      logger.error(`Web3 balance retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transaction count (nonce) for an address
   * @param {string} address - Ethereum address
   * @param {string} network - Network name
   * @returns {Promise<number>} Transaction count
   */
  async getTransactionCount(address, network = 'ethereum') {
    const cacheKey = `web3:${network}:nonce:${address}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Web3 nonce: ${cacheKey}`);
      return parseInt(cached);
    }

    try {
      const web3 = web3Providers[network];
      if (!web3) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const nonce = await web3Breaker.fire(async () => {
        return await web3.eth.getTransactionCount(address);
      });
      
      // Cache for 10 seconds (nonces change frequently)
      await cache.set(cacheKey, nonce.toString(), 10);
      logger.info(`Retrieved ${network} nonce for address: ${address}`);
      return nonce;
    } catch (error) {
      logger.error(`Web3 nonce retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get block number
   * @param {string} network - Network name
   * @returns {Promise<number>} Block number
   */
  async getBlockNumber(network = 'ethereum') {
    const cacheKey = `web3:${network}:block_number`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Web3 block number: ${cacheKey}`);
      return parseInt(cached);
    }

    try {
      const web3 = web3Providers[network];
      if (!web3) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const blockNumber = await web3Breaker.fire(async () => {
        return await web3.eth.getBlockNumber();
      });
      
      // Cache for 5 seconds (blocks are mined frequently)
      await cache.set(cacheKey, blockNumber.toString(), 5);
      logger.info(`Retrieved ${network} block number: ${blockNumber}`);
      return blockNumber;
    } catch (error) {
      logger.error(`Web3 block number retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get transaction receipt
   * @param {string} txHash - Transaction hash
   * @param {string} network - Network name
   * @returns {Promise<Object>} Transaction receipt
   */
  async getTransactionReceipt(txHash, network = 'ethereum') {
    const cacheKey = `web3:${network}:receipt:${txHash}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Web3 transaction receipt: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const web3 = web3Providers[network];
      if (!web3) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const receipt = await web3Breaker.fire(async () => {
        return await web3.eth.getTransactionReceipt(txHash);
      });
      
      // Cache for 1 hour (transaction receipts are immutable)
      await cache.set(cacheKey, JSON.stringify(receipt), 3600);
      logger.info(`Retrieved ${network} transaction receipt: ${txHash}`);
      return receipt;
    } catch (error) {
      logger.error(`Web3 transaction receipt retrieval failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Call a smart contract method (read-only)
   * @param {string} contractAddress - Contract address
   * @param {Array} abi - Contract ABI
   * @param {string} methodName - Method name to call
   * @param {Array} params - Method parameters
   * @param {string} network - Network name
   * @returns {Promise<any>} Method call result
   */
  async callContractMethod(contractAddress, abi, methodName, params = [], network = 'ethereum') {
    const cacheKey = `web3:${network}:call:${contractAddress}:${methodName}:${params.join(':')}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for Web3 contract call: ${cacheKey}`);
      return JSON.parse(cached);
    }

    try {
      const web3 = web3Providers[network];
      if (!web3) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const contract = new web3.eth.Contract(abi, contractAddress);
      const result = await web3Breaker.fire(async () => {
        return await contract.methods[methodName](...params).call();
      });
      
      // Cache for 5 minutes (contract calls can change but not too frequently)
      await cache.set(cacheKey, JSON.stringify(result), 300);
      logger.info(`Called ${network} contract method: ${methodName} on ${contractAddress}`);
      return result;
    } catch (error) {
      logger.error(`Web3 contract call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get token balance (ERC-20)
   * @param {string} tokenContractAddress - Token contract address
   * @param {string} walletAddress - Wallet address
   * @param {string} network - Network name
   * @returns {Promise<string>} Token balance (in smallest unit)
   */
  async getTokenBalance(tokenContractAddress, walletAddress, network = 'ethereum') {
    // Standard ERC-20 ABI for balanceOf function
    const erc20Abi = [
      {
        "constant": true,
        "inputs": [{ "name": "_owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "balance", "type": "uint256" }],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "name": "", "type": "uint8" }],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{ "name": "", "type": "string" }],
        "type": "function"
      }
    ];

    try {
      // Get token balance
      const balanceHex = await this.callContractMethod(
        tokenContractAddress,
        erc20Abi,
        "balanceOf",
        [walletAddress],
        network
      );

      // Get token decimals
      const decimals = await this.callContractMethod(
        tokenContractAddress,
        erc20Abi,
        "decimals",
        [],
        network
      );

      // Get token symbol
      const symbol = await this.callContractMethod(
        tokenContractAddress,
        erc20Abi,
        "symbol",
        [],
        network
      );

      logger.info(`Retrieved ${network} token balance for ${walletAddress}: ${balanceHex} ${symbol}`);
      return {
        balance: balanceHex,
        decimals: decimals,
        symbol: symbol,
        formattedBalance: parseInt(balanceHex) / Math.pow(10, parseInt(decimals))
      };
    } catch (error) {
      logger.error(`Web3 token balance retrieval failed: ${error.message}`);
      throw error;
    }
  }
}

export default new Web3Adapter();