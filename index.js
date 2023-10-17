const { Web3 } = require('web3');
const momentjs = require('moment');
const BNify = require('bignumber.js');
const erc20ABI = require('./ERC20.json');
const Multicall = require('./Multicall.js');
const idleCDOAbi = require('./idleCDO.json');

require('dotenv').config()

// const events = require('./events.js');
// const vaultSupplies = require('./vaultSupplies.json');
// const blocksTimestamps = require('./blocksTimestamps.json');

const web3 = new Web3(new Web3.providers.HttpProvider(`https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_OPTIMISM_KEY}`));
const multiCall = new Multicall(web3);

const debugLog = false;

const vaults = {
  AA_clearpool_portofino_USDC:{
    functions:{
      fee:'fee',
      price:'virtualPrice'
    },
    token:'USDC',
    decimals: 18,
    abi: erc20ABI,
    address:'0xE422ca30eCC45Fc45e5ADD79E54505345F0cd482',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x957572d61DD16662471c744837d4905bC04Bbaeb'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0xE422ca30eCC45Fc45e5ADD79E54505345F0cd482')
  },
  BB_clearpool_portofino_USDC:{
    functions:{
      fee:'fee',
      price:'virtualPrice'
    },
    token:'USDC',
    decimals: 18,
    abi: erc20ABI,
    address:'0x56A4283a4CE7202672A1518340732d5ffC511c0b',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x957572d61DD16662471c744837d4905bC04Bbaeb'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x56A4283a4CE7202672A1518340732d5ffC511c0b')
  },
  AA_clearpool_fasanara_USDT:{
    functions:{
      fee:'fee',
      price:'virtualPrice'
    },
    token:'USDT',
    decimals: 18,
    abi: erc20ABI,
    address:'0x50BA0c3f940f0e851f8e30f95d2A839216EC5eC9',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x94e399Af25b676e7783fDcd62854221e67566b7f'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x50BA0c3f940f0e851f8e30f95d2A839216EC5eC9')
  },
  BB_clearpool_fasanara_USDT:{
    functions:{
      fee:'fee',
      price:'virtualPrice'
    },
    token:'USDT',
    decimals: 18,
    abi: erc20ABI,
    address:'0x7038D2A5323064f7e590EADc0E8833F2613F6317',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x94e399Af25b676e7783fDcd62854221e67566b7f'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x7038D2A5323064f7e590EADc0E8833F2613F6317')
  },
}

async function getVaultTotalSupplyBlocks(vaultData, blocks) {
  const promises = blocks.map( blockNumber => vaultData.trancheContract.methods['totalSupply']().call({}, parseInt(blockNumber)).then( totalSupply => ({blockNumber, totalSupply}) ) )
  const results = await Promise.all(promises);
  return results.reduce( (suppliesBlocks, result) => {
    suppliesBlocks[result.blockNumber] = BNify(result.totalSupply).div(1e18)
    if (debugLog){
      console.log(`"${result.blockNumber}": ${BNify(result.totalSupply).div(1e18).toString()},`);
    }
    return suppliesBlocks
  }, {})
}

async function getVaultFee(vaultData) {
  const fee = await vaultData.cdoContract.methods[vaultData.functions.fee]().call();
  return BNify(fee).div(1e05);
}

async function getBlocksTimestamps(blocks){
  const promises = blocks.map( blockNumber => web3.eth.getBlock(blockNumber).then( blockInfo => ({blockNumber, timestamp: blockInfo.timestamp}) ) )
  const results = await Promise.all(promises);
  return results.reduce( (blocksTimestamps, result) => {
    blocksTimestamps[result.blockNumber] = result.timestamp;
    // console.log(`"${result.blockNumber}": ${result.timestamp},`);
    return blocksTimestamps;
  }, {})
}


async function getTokenBalances(vaultData, startBlock, endBlock) {
  const tokenContract = new web3.eth.Contract(vaultData.abi, vaultData.address);
  
  const events = await tokenContract.getPastEvents('Transfer', {
    fromBlock: 0,
    toBlock: endBlock
  });
  const eventsBlocks = [startBlock];
  events.forEach( event => {
    if (eventsBlocks.indexOf(event.blockNumber) === -1){
      eventsBlocks.push(event.blockNumber);
    }
  });
  eventsBlocks.push(endBlock);

  // events.forEach(event => {
  //   console.log(event);
  // });
  // return {};

  // Get vault prices at specific blocks
  const [
    vaultFee,
    blocksTimestamps,
    vaultSupplies,
  ] = await Promise.all([
    getVaultFee(vaultData),
    getBlocksTimestamps(eventsBlocks),
    getVaultTotalSupplyBlocks(vaultData, eventsBlocks)
  ]);

  // return {}

  const holdersMap = {};

  // Calculate total pool share
  const startTimestamp = blocksTimestamps[startBlock];
  const endTimestamp = blocksTimestamps[endBlock];

  const totalPeriodInfo = Object.keys(vaultSupplies).reduce( (totalPeriodInfo, supplyBlock) => {
    const blockTimestamp = BNify(blocksTimestamps[supplyBlock]);
    // Skip if before start time
    if (blockTimestamp.lt(startTimestamp)){
      return totalPeriodInfo
    }

    const blockTotalSupply = BNify(vaultSupplies[supplyBlock]);
    if (totalPeriodInfo.prevTimestamp){
      totalPeriodInfo.totalPeriod = totalPeriodInfo.totalPeriod.plus(blockTimestamp.minus(totalPeriodInfo.prevTimestamp));
    }
    if (blockTotalSupply.gt(0)){
      totalPeriodInfo.prevTimestamp = blockTimestamp;
    } else {
      totalPeriodInfo.prevTimestamp = null;
    }
    return totalPeriodInfo;
  }, {
    totalPeriod: BNify(0),
    prevTimestamp: null,
  });

  const totalPeriod = totalPeriodInfo.totalPeriod;

  events.forEach(event => {
    const from = event.returnValues.from.toLowerCase();
    const to = event.returnValues.to.toLowerCase();
    const blockNumber = event.blockNumber;

    if (from !== '0x0000000000000000000000000000000000000000') {
      if (!holdersMap[from]){
        holdersMap[from] = {
          total: BNify(0),
          blockNumber: null,
          endTimestamp: null,
          poolShare: BNify(0),
          startTimestamp: null,
          holdingPeriod: BNify(0),
          avgUserSupply: BNify(0),
          avgTotalSupply: BNify(0),
        }
      }

      // Calculate fees
      if (holdersMap[from].total.gt(0)){
        let prevSupply = null;
        let prevSupplyBlockNumber = null;
        Object.keys(vaultSupplies).filter( supplyBlockNumber => BNify(supplyBlockNumber).gte(holdersMap[from].blockNumber) && BNify(supplyBlockNumber).lte(blockNumber) ).forEach( supplyBlockNumber => {
          const blockTotalSupply = BNify(vaultSupplies[supplyBlockNumber]);
          const blockTimestamp = blocksTimestamps[supplyBlockNumber];

          if (!prevSupply){
            prevSupply = blockTotalSupply;
          }

          // Init blockNumber
          holdersMap[from][supplyBlockNumber] = {
            endTime: null,
            startTime: null,
            balance: BNify(0),
            poolShare: BNify(0),
            holdingPeriod: BNify(0),
            avgTotalSupply: BNify(0),
          };

          const poolShare = prevSupply.gt(0) ? holdersMap[from].total.div(prevSupply) : BNify(0);
          holdersMap[from][supplyBlockNumber].poolShare = poolShare;
          holdersMap[from][supplyBlockNumber].endTime = blockTimestamp;
          holdersMap[from][supplyBlockNumber].avgTotalSupply = prevSupply;
          holdersMap[from][supplyBlockNumber].startTime = holdersMap[from].endTimestamp;
          // holdersMap[from][supplyBlockNumber].holdingPeriod = holdersMap[from][supplyBlockNumber].endTime-holdersMap[from][supplyBlockNumber].startTime;

          // Calculate total pool share
            // holdersMap[from].poolShare = holdersMap[from].poolShare.plus(poolShare.times(holdersMap[from][supplyBlockNumber].holdingPeriod));
          const holdingPeriod = BNify(blockTimestamp).minus(BNify.maximum(holdersMap[from][supplyBlockNumber].startTime, startTimestamp));
          if (holdingPeriod.gt(0)){
            holdersMap[from][supplyBlockNumber].holdingPeriod = holdingPeriod;
            holdersMap[from].poolShare = holdersMap[from].poolShare.plus(poolShare.times(holdingPeriod));
            holdersMap[from].holdingPeriod = holdersMap[from].holdingPeriod.plus(holdingPeriod);
          }
          
          if (debugLog){
            console.log('FROM', from, parseInt(holdersMap[from].blockNumber), supplyBlockNumber, parseInt(blockNumber), momentjs(parseInt(holdersMap[from][supplyBlockNumber].startTime)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(holdersMap[from][supplyBlockNumber].endTime)*1000).format('DD-MM-YYYY HH:mm'), holdingPeriod.toString(), holdersMap[from].total.toString(), prevSupply.toString(), poolShare.toString(), holdersMap[from].holdingPeriod.toString());
          }

          // Update endTimestamp
          holdersMap[from].endTimestamp = blockTimestamp;
          prevSupplyBlockNumber = supplyBlockNumber;
          prevSupply = blockTotalSupply;
        });
      }

      const newBalance = BNify.maximum(0, holdersMap[from].total.minus(BNify(event.returnValues.value).div('1e18')));
      holdersMap[from].total = newBalance;
      holdersMap[from].blockNumber = blockNumber;
      if (!holdersMap[from].startTimestamp) {
        holdersMap[from].startTimestamp = blocksTimestamps[blockNumber];
      }
      holdersMap[from].endTimestamp = blocksTimestamps[blockNumber];

      // if (newBalance.lte(0)){
      //   holdersMap[from].startTimestamp = null;
      //   holdersMap[from].endTimestamp = null;
      // }
    }

    if (to !== '0x0000000000000000000000000000000000000000'){
      if (!holdersMap[to]){
        holdersMap[to] = {
          total: BNify(0),
          blockNumber: null,
          endTimestamp: null,
          poolShare: BNify(0),
          startTimestamp: null,
          holdingPeriod: BNify(0),
          avgUserSupply: BNify(0),
          avgTotalSupply: BNify(0),
        }
      }

      // Calculate fees
      if (holdersMap[to].total.gt(0)){
        let prevSupply = null;
        let prevSupplyBlockNumber = null;
        Object.keys(vaultSupplies).filter( supplyBlockNumber => BNify(supplyBlockNumber).gte(holdersMap[to].blockNumber) && BNify(supplyBlockNumber).lte(blockNumber) ).forEach( supplyBlockNumber => {
          const blockTotalSupply = BNify(supplyBlockNumber).eq(blockNumber) ? BNify(vaultSupplies[prevSupplyBlockNumber]) : BNify(vaultSupplies[supplyBlockNumber]);
          const blockTimestamp = blocksTimestamps[supplyBlockNumber];

          if (!prevSupply){
            prevSupply = blockTotalSupply;
          }

          // Init blockNumber
          holdersMap[to][supplyBlockNumber] = {
            endTime: null,
            startTime: null,
            balance: BNify(0),
            poolShare: BNify(0),
            holdingPeriod: BNify(0),
            avgTotalSupply: BNify(0),
          };

          // Init blockNumber
          holdersMap[to][supplyBlockNumber] = {
            endTime: null,
            startTime: null,
            balance: BNify(0),
            poolShare: BNify(0),
            holdingPeriod: BNify(0),
            avgTotalSupply: BNify(0),
          };

          const poolShare = prevSupply.gt(0) ? holdersMap[to].total.div(prevSupply) : BNify(0);
          holdersMap[to][supplyBlockNumber].poolShare = poolShare;
          holdersMap[to][supplyBlockNumber].endTime = blockTimestamp;
          holdersMap[to][supplyBlockNumber].avgTotalSupply = prevSupply;
          holdersMap[to][supplyBlockNumber].startTime = holdersMap[to].endTimestamp;
          // holdersMap[to][supplyBlockNumber].holdingPeriod = holdersMap[to][supplyBlockNumber].endTime-holdersMap[to][supplyBlockNumber].startTime;

          // Calculate total pool share
          // holdersMap[to].poolShare = holdersMap[to].poolShare.plus(poolShare.times(holdersMap[to][supplyBlockNumber].holdingPeriod));
          const holdingPeriod = BNify(blockTimestamp).minus(BNify.maximum(holdersMap[to][supplyBlockNumber].startTime, startTimestamp));
          if (holdingPeriod.gt(0)){
            holdersMap[to][supplyBlockNumber].holdingPeriod = holdingPeriod;
            holdersMap[to].poolShare = holdersMap[to].poolShare.plus(poolShare.times(holdingPeriod));
            holdersMap[to].holdingPeriod = holdersMap[to].holdingPeriod.plus(holdingPeriod);
          }
          
          if (debugLog){
            console.log('TO', to, parseInt(holdersMap[to].blockNumber), supplyBlockNumber, parseInt(blockNumber), momentjs(parseInt(holdersMap[to][supplyBlockNumber].startTime)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(holdersMap[to][supplyBlockNumber].endTime)*1000).format('DD-MM-YYYY HH:mm'), holdingPeriod.toString(), holdersMap[to].total.toString(), prevSupply.toString(), poolShare.toString(), holdersMap[to].holdingPeriod.toString());
          }

          // Update endTimestamp
          holdersMap[to].endTimestamp = blockTimestamp;
          prevSupplyBlockNumber = supplyBlockNumber;
          prevSupply = blockTotalSupply;
        });
      }

      const newBalance = holdersMap[to].total.plus(BNify(event.returnValues.value).div(1e18))
      // holdersMap[to][blockNumber].balance = newBalance.toString()
      holdersMap[to].total = newBalance
      holdersMap[to].blockNumber = blockNumber
      if (!holdersMap[to].startTimestamp) {
        holdersMap[to].startTimestamp = blocksTimestamps[blockNumber];
      }
      holdersMap[to].endTimestamp = blocksTimestamps[blockNumber];
    }
  });

  let superTotal = BNify(0);
  
  // return holdersMap;
  Object.keys(holdersMap).reduce( (holders, address) => {
    // Calculate last period pool share
    if (holdersMap[address].total.gt(0)){
      let prevSupply = null;
      Object.keys(vaultSupplies).filter( supplyBlockNumber => BNify(supplyBlockNumber).gte(holdersMap[address].blockNumber) && BNify(supplyBlockNumber).lte(endBlock) ).forEach( supplyBlockNumber => {
        const blockTotalSupply = BNify(vaultSupplies[supplyBlockNumber]);
        const blockTimestamp = blocksTimestamps[supplyBlockNumber];

        if (!prevSupply){
          prevSupply = blockTotalSupply;
        }

        // Init blockNumber
        holdersMap[address][supplyBlockNumber] = {
          endTime: null,
          startTime: null,
          balance: BNify(0),
          poolShare: BNify(0),
          holdingPeriod: BNify(0),
          avgTotalSupply: BNify(0),
        };

        // Init blockNumber
        holdersMap[address][supplyBlockNumber] = {
          endTime: null,
          startTime: null,
          balance: BNify(0),
          poolShare: BNify(0),
          holdingPeriod: BNify(0),
          avgTotalSupply: BNify(0),
        };

        const poolShare = holdersMap[address].total.div(prevSupply);
        holdersMap[address][supplyBlockNumber].poolShare = poolShare;
        holdersMap[address][supplyBlockNumber].endTime = blockTimestamp;
        holdersMap[address][supplyBlockNumber].avgTotalSupply = prevSupply;
        holdersMap[address][supplyBlockNumber].startTime = holdersMap[address].endTimestamp;
        // holdersMap[address][supplyBlockNumber].holdingPeriod = holdersMap[address][supplyBlockNumber].endTime-holdersMap[address][supplyBlockNumber].startTime;

        // Calculate total pool share
        const holdingPeriod = BNify(blockTimestamp).minus(BNify.maximum(holdersMap[address][supplyBlockNumber].startTime, startTimestamp));
        if (holdingPeriod.gt(0)){
          holdersMap[address][supplyBlockNumber].holdingPeriod = holdingPeriod;
          holdersMap[address].poolShare = holdersMap[address].poolShare.plus(poolShare.times(holdingPeriod));
          holdersMap[address].holdingPeriod = holdersMap[address].holdingPeriod.plus(holdingPeriod);
        }

        if (debugLog){
          console.log('FIN', address, parseInt(holdersMap[address].blockNumber), supplyBlockNumber, parseInt(endBlock), momentjs(parseInt(holdersMap[address][supplyBlockNumber].startTime)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(holdersMap[address][supplyBlockNumber].endTime)*1000).format('DD-MM-YYYY HH:mm'), holdingPeriod.toString(), holdersMap[address].total.toString(), prevSupply.toString(), poolShare.toString(), holdersMap[address].holdingPeriod.toString());
        }

        // Update endTimestamp
        holdersMap[address].endTimestamp = blockTimestamp;
        prevSupply = blockTotalSupply;
      });
    }

    // Calculate pool Share
    if (holdersMap[address].poolShare.gt(0)){
      const initialPoolShare = holdersMap[address].poolShare.div(holdersMap[address].holdingPeriod);
      holdersMap[address].poolShare = holdersMap[address].poolShare.div(totalPeriod);
      if (debugLog){
        console.log("TOTAL", address, holdersMap[address].holdingPeriod.toString(), BNify(totalPeriod).toString(), initialPoolShare.times(100).toFixed(8)+"%", "=>", holdersMap[address].poolShare.times(100).toFixed(8)+"%");
      }
      superTotal = superTotal.plus(holdersMap[address].poolShare.times(100));
    }

    return holders
  }, {});

  if (debugLog){
    console.log('GRANDTOTAL', superTotal.toString());
  }

  return holdersMap;
}

async function main(){

  const csv = [
    ['Vault', 'Token', 'Address', 'Token Balance', 'Avg Share %', 'OP'].join(',')
  ];

  const totalOP = 1000;
  const startBlock = 110450190; // Optimism
  const endBlock = (await web3.eth.getBlock()).number // now

  const promises = Object.keys(vaults).map( token => getTokenBalances(vaults[token], startBlock, endBlock).then( holders => ({[token]: holders}) ) )
  const results = await Promise.all(promises);

  for (var i = 0; i < results.length; i++) {
    const tokenBalances = results[i]
    const token = Object.keys(tokenBalances)[0]
    const vaultData = vaults[token]
    Object.keys(tokenBalances[token]).map( holder => {
      const holderInfo = tokenBalances[token][holder];
      if (holderInfo.poolShare.gt(0)){
        csv.push([token, vaultData.token, holder, holderInfo.total.toFixed(8), holderInfo.poolShare.times(100).toFixed(8), BNify(totalOP).times(holderInfo.poolShare).toFixed(8)]);
      }
    });
  }

  console.log(csv.join("\n"));
}

main();