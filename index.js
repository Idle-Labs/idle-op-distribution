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
// const web3 = new Web3(new Web3.providers.HttpProvider(`https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_MAINNET_KEY}`));
// const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_MAINNET_KEY}`));
const multiCall = new Multicall(web3);

let endBlock = null;
const debugLog = false;
let blocksTimestamps = {}
let vaultsSuppliesBlocks = {}
const startBlock = 111317188; // Optimism
const totalRewardsPerVault = BNify(3125);

const totalDays = 7
const totalTime = 86400*totalDays

const CDOs = {
  USDTPor: {
    CDO:{
      address: '0x8771128e9E386DC8E4663118BB11EA3DE910e528',
      contract: new web3.eth.Contract(idleCDOAbi, '0x8771128e9E386DC8E4663118BB11EA3DE910e528'),
    },
    AA:{
      type: 'AA',
      token:'USDC',
      decimals: 18,
      abi: erc20ABI,
      name: 'AA_clearpool_portofino_USDC',
      address:'0x8552801C75C4f2b1Cac088aF352193858B201D4E',
      trancheContract: new web3.eth.Contract(erc20ABI, '0x8552801C75C4f2b1Cac088aF352193858B201D4E')
    },
    BB:{
      type: 'BB',
      token:'USDC',
      decimals: 18,
      abi: erc20ABI,
      name: 'BB_clearpool_portofino_USDC',
      address:'0xafbAeA12DE33bF6B44105Eceecec24B29163077c',
      trancheContract: new web3.eth.Contract(erc20ABI, '0xafbAeA12DE33bF6B44105Eceecec24B29163077c')
    },
  },
  USDTFas: {
    CDO:{
      address: '0x94e399Af25b676e7783fDcd62854221e67566b7f',
      contract: new web3.eth.Contract(idleCDOAbi, '0x94e399Af25b676e7783fDcd62854221e67566b7f'),
    },  
    AA:{
      type: 'AA',
      token:'USDT',
      decimals: 18,
      abi: erc20ABI,
      name: 'AA_clearpool_fasanara_USDT',
      address:'0x50BA0c3f940f0e851f8e30f95d2A839216EC5eC9',
      trancheContract: new web3.eth.Contract(erc20ABI, '0x50BA0c3f940f0e851f8e30f95d2A839216EC5eC9')
    },
    BB:{
      type: 'BB',
      token:'USDT',
      decimals: 18,
      abi: erc20ABI,
      name: 'BB_clearpool_fasanara_USDT',
      address:'0x7038D2A5323064f7e590EADc0E8833F2613F6317',
      trancheContract: new web3.eth.Contract(erc20ABI, '0x7038D2A5323064f7e590EADc0E8833F2613F6317')
    },
  }
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

async function getVaultSplitRatioBlocks(cdoData, blocks) {
  const promises = blocks.map( blockNumber => cdoData.CDO.contract.methods['trancheAPRSplitRatio']().call({}, parseInt(blockNumber)).then( trancheAPRSplitRatio => ({blockNumber, trancheAPRSplitRatio}) ) )
  const results = await Promise.all(promises);
  return results.reduce( (splitRatios, result) => {
    splitRatios[result.blockNumber] = BNify(result.trancheAPRSplitRatio)
    if (debugLog){
      console.log(`"${result.blockNumber}": ${BNify(result.trancheAPRSplitRatio).toString()},`);
    }
    return splitRatios
  }, {})
}

async function getBlocksTimestamps(blocks){
  const promises = blocks.map( blockNumber => web3.eth.getBlock(blockNumber).then( blockInfo => ({blockNumber, timestamp: blockInfo.timestamp}) ) )
  const results = await Promise.all(promises);
  return results.reduce( (blocksTimestamps, result) => {
    blocksTimestamps[result.blockNumber] = parseInt(result.timestamp)
    // console.log(`"${result.blockNumber}": ${result.timestamp},`);
    return blocksTimestamps;
  }, {})
}

const getVaultAprRatio = (tvlAARatio) => {
  const FULL_ALLOC = 100000
  const AA_RATIO_LIM_DOWN = 50000
  const AA_RATIO_LIM_UP = 99000
  
  let aux = AA_RATIO_LIM_DOWN;
  if (tvlAARatio >= AA_RATIO_LIM_UP) {
      aux = AA_RATIO_LIM_UP;
  } else if (tvlAARatio > AA_RATIO_LIM_DOWN) {
      aux = tvlAARatio;
  }
  return BNify((aux * tvlAARatio) / FULL_ALLOC / FULL_ALLOC);
}

async function getVaultSplitRatios(cdoData){
  const aa_events = await cdoData.AA.trancheContract.getPastEvents('Transfer', {
    fromBlock: startBlock,
    toBlock: endBlock
  });

  const bb_events = await cdoData.BB.trancheContract.getPastEvents('Transfer', {
    fromBlock: startBlock,
    toBlock: endBlock
  });

  const eventsBlocks = [];
  aa_events.forEach( event => {
    if (eventsBlocks.indexOf(event.blockNumber) === -1){
      eventsBlocks.push(event.blockNumber);
    }
  });
  bb_events.forEach( event => {
    if (eventsBlocks.indexOf(event.blockNumber) === -1){
      eventsBlocks.push(event.blockNumber);
    }
  });

  if (eventsBlocks.indexOf(startBlock) === -1){
    eventsBlocks.push(startBlock)
  }
  if (eventsBlocks.indexOf(endBlock) === -1){
    eventsBlocks.push(endBlock)
  }

  // Get vault split ratio only from startBlock to endBlock
  return await getVaultSplitRatioBlocks(cdoData, eventsBlocks.filter( blockNumber => BNify(blockNumber).gte(startBlock) && BNify(blockNumber).lte(endBlock) ))
}

async function getAAVaultRewardsRatio(vaultData, aaTrancheContract, bbTrancheContract, startBlock, endBlock) {
  const aa_events = await aaTrancheContract.getPastEvents('Transfer', {
    fromBlock: startBlock,
    toBlock: endBlock
  });

  const bb_events = await bbTrancheContract.getPastEvents('Transfer', {
    fromBlock: startBlock,
    toBlock: endBlock
  });

  const eventsBlocks = [];
  aa_events.forEach( event => {
    if (eventsBlocks.indexOf(event.blockNumber) === -1){
      eventsBlocks.push(event.blockNumber);
    }
  });
  bb_events.forEach( event => {
    if (eventsBlocks.indexOf(event.blockNumber) === -1){
      eventsBlocks.push(event.blockNumber);
    }
  });

  if (eventsBlocks.indexOf(startBlock) === -1){
    eventsBlocks.push(startBlock)
  }
  if (eventsBlocks.indexOf(endBlock) === -1){
    eventsBlocks.push(endBlock)
  }

  // Get vault split ratio only from startBlock to endBlock
  const vaultSplitRatios = await getVaultSplitRatioBlocks(vaultData, eventsBlocks.filter( blockNumber => BNify(blockNumber).gte(startBlock) && BNify(blockNumber).lte(endBlock) ))

  // console.log('vaultSplitRatios', vaultData.cdoAddress, eventsBlocks, vaultSplitRatios)

  let avgSplitRatio = BNify(0)
  if (Object.keys(vaultSplitRatios).length>0){
    let prevTimestamp = null;
    let prevSplitRatio = null;
    let prevBlockNumber = null;
    const avgSplitRatioInfo = Object.keys(vaultSplitRatios).reduce( (avgSplitRatioInfo, splitRatioBlock) => {
      const blockTimestamp = BNify(blocksTimestamps[splitRatioBlock]);
      if (prevTimestamp){
        const splitRatioDuration = blockTimestamp.minus(prevTimestamp);
        avgSplitRatioInfo.num = avgSplitRatioInfo.num.plus(prevSplitRatio.times(splitRatioDuration));
        avgSplitRatioInfo.denom = avgSplitRatioInfo.denom.plus(splitRatioDuration)
        // console.log(vaultData.cdoAddress, prevBlockNumber, splitRatioBlock, momentjs(parseInt(prevTimestamp)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(blockTimestamp)*1000).format('DD-MM-YYYY HH:mm'), prevSplitRatio.toString())
      }
      prevTimestamp = blockTimestamp;
      prevBlockNumber = splitRatioBlock
      prevSplitRatio = BNify(vaultSplitRatios[splitRatioBlock]);
      return avgSplitRatioInfo;
    }, {
      num: BNify(0),
      denom: BNify(0)
    })

    avgSplitRatio = avgSplitRatioInfo.num.div(avgSplitRatioInfo.denom)
    // console.log('avgSplitRatio', avgSplitRatioInfo.num.toString(), avgSplitRatioInfo.denom.toString(), avgSplitRatio.toString());
  }

  // console.log('avgSplitRatio', vaultData.cdoAddress, avgSplitRatio.toString(), getVaultAprRatio(parseInt(avgSplitRatio)).toString());

  return getVaultAprRatio(parseInt(avgSplitRatio));
}

async function getTokenBalances(cdoName, cdoData, vaultData) {
  // const tokenContract = new web3.eth.Contract(vaultData.abi, vaultData.address);
  
  const events = await vaultData.trancheContract.getPastEvents('Transfer', {
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
    vaultSupplies
  ] = await Promise.all([
    getVaultTotalSupplyBlocks(vaultData, eventsBlocks),
  ]);

  if (!vaultsSuppliesBlocks[cdoName]){
    vaultsSuppliesBlocks[cdoName] = {}
  }
  vaultsSuppliesBlocks[cdoName][vaultData.type] = vaultSupplies

  const holdersMap = {};

  // Calculate total pool share
  const startTimestamp = blocksTimestamps[startBlock]
  const endTimestamp = blocksTimestamps[endBlock]

  const totalPeriodInfo = Object.keys(vaultSupplies).reduce( (totalPeriodInfo, supplyBlock) => {
    const blockTimestamp = BNify(blocksTimestamps[supplyBlock])
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
          blocks: {},
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
          holdersMap[from].blocks[supplyBlockNumber] = {
            endTime: null,
            startTime: null,
            balance: BNify(0),
            poolShare: BNify(0),
            holdingPeriod: BNify(0),
            avgTotalSupply: BNify(0),
          };

          const poolShare = prevSupply.gt(0) ? holdersMap[from].total.div(prevSupply) : BNify(0);
          holdersMap[from].blocks[supplyBlockNumber].poolShare = poolShare;
          holdersMap[from].blocks[supplyBlockNumber].endTime = blockTimestamp;
          holdersMap[from].blocks[supplyBlockNumber].avgTotalSupply = prevSupply;
          holdersMap[from].blocks[supplyBlockNumber].balance = holdersMap[from].total;
          holdersMap[from].blocks[supplyBlockNumber].startTime = holdersMap[from].endTimestamp;
          // holdersMap[from].blocks[supplyBlockNumber].holdingPeriod = holdersMap[from].blocks[supplyBlockNumber].endTime-holdersMap[from].blocks[supplyBlockNumber].startTime;

          // Calculate total pool share
            // holdersMap[from].poolShare = holdersMap[from].poolShare.plus(poolShare.times(holdersMap[from].blocks[supplyBlockNumber].holdingPeriod));
          const holdingPeriod = BNify(blockTimestamp).minus(BNify.maximum(holdersMap[from].blocks[supplyBlockNumber].startTime, startTimestamp));
          if (holdingPeriod.gt(0)){
            holdersMap[from].blocks[supplyBlockNumber].holdingPeriod = holdingPeriod;
            holdersMap[from].poolShare = holdersMap[from].poolShare.plus(poolShare.times(holdingPeriod));
            holdersMap[from].holdingPeriod = holdersMap[from].holdingPeriod.plus(holdingPeriod);
          }
          
          if (debugLog){
            console.log('FROM', from, parseInt(holdersMap[from].blockNumber), supplyBlockNumber, parseInt(blockNumber), momentjs(parseInt(holdersMap[from].blocks[supplyBlockNumber].startTime)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(holdersMap[from].blocks[supplyBlockNumber].endTime)*1000).format('DD-MM-YYYY HH:mm'), holdingPeriod.toString(), holdersMap[from].total.toString(), prevSupply.toString(), poolShare.toString(), holdersMap[from].holdingPeriod.toString());
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
          blocks: {},
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
          holdersMap[to].blocks[supplyBlockNumber] = {
            endTime: null,
            startTime: null,
            balance: BNify(0),
            poolShare: BNify(0),
            holdingPeriod: BNify(0),
            avgTotalSupply: BNify(0),
          };

          // Init blockNumber
          holdersMap[to].blocks[supplyBlockNumber] = {
            endTime: null,
            startTime: null,
            balance: BNify(0),
            poolShare: BNify(0),
            holdingPeriod: BNify(0),
            avgTotalSupply: BNify(0),
          };

          const poolShare = prevSupply.gt(0) ? holdersMap[to].total.div(prevSupply) : BNify(0);
          holdersMap[to].blocks[supplyBlockNumber].poolShare = poolShare;
          holdersMap[to].blocks[supplyBlockNumber].endTime = blockTimestamp;
          holdersMap[to].blocks[supplyBlockNumber].avgTotalSupply = prevSupply;
          holdersMap[to].blocks[supplyBlockNumber].balance = holdersMap[to].total;
          holdersMap[to].blocks[supplyBlockNumber].startTime = holdersMap[to].endTimestamp;
          // holdersMap[to].blocks[supplyBlockNumber].holdingPeriod = holdersMap[to].blocks[supplyBlockNumber].endTime-holdersMap[to].blocks[supplyBlockNumber].startTime;

          // Calculate total pool share
          // holdersMap[to].poolShare = holdersMap[to].poolShare.plus(poolShare.times(holdersMap[to].blocks[supplyBlockNumber].holdingPeriod));
          const holdingPeriod = BNify(blockTimestamp).minus(BNify.maximum(holdersMap[to].blocks[supplyBlockNumber].startTime, startTimestamp));
          if (holdingPeriod.gt(0)){
            holdersMap[to].blocks[supplyBlockNumber].holdingPeriod = holdingPeriod;
            holdersMap[to].poolShare = holdersMap[to].poolShare.plus(poolShare.times(holdingPeriod));
            holdersMap[to].holdingPeriod = holdersMap[to].holdingPeriod.plus(holdingPeriod);
          }
          
          if (debugLog){
            console.log('TO', to, parseInt(holdersMap[to].blockNumber), supplyBlockNumber, parseInt(blockNumber), momentjs(parseInt(holdersMap[to].blocks[supplyBlockNumber].startTime)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(holdersMap[to].blocks[supplyBlockNumber].endTime)*1000).format('DD-MM-YYYY HH:mm'), holdingPeriod.toString(), holdersMap[to].total.toString(), prevSupply.toString(), poolShare.toString(), holdersMap[to].holdingPeriod.toString());
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
        holdersMap[address].blocks[supplyBlockNumber] = {
          endTime: null,
          startTime: null,
          balance: BNify(0),
          poolShare: BNify(0),
          holdingPeriod: BNify(0),
          avgTotalSupply: BNify(0),
        };

        // Init blockNumber
        holdersMap[address].blocks[supplyBlockNumber] = {
          endTime: null,
          startTime: null,
          balance: BNify(0),
          poolShare: BNify(0),
          holdingPeriod: BNify(0),
          avgTotalSupply: BNify(0),
        };

        const poolShare = holdersMap[address].total.div(prevSupply);
        holdersMap[address].blocks[supplyBlockNumber].poolShare = poolShare;
        holdersMap[address].blocks[supplyBlockNumber].endTime = blockTimestamp;
        holdersMap[address].blocks[supplyBlockNumber].avgTotalSupply = prevSupply;
        holdersMap[address].blocks[supplyBlockNumber].balance = holdersMap[address].total;
        holdersMap[address].blocks[supplyBlockNumber].startTime = holdersMap[address].endTimestamp;
        // holdersMap[address].blocks[supplyBlockNumber].holdingPeriod = holdersMap[address].blocks[supplyBlockNumber].endTime-holdersMap[address].blocks[supplyBlockNumber].startTime;

        // Calculate total pool share
        const holdingPeriod = BNify(blockTimestamp).minus(BNify.maximum(holdersMap[address].blocks[supplyBlockNumber].startTime, startTimestamp));
        if (holdingPeriod.gt(0)){
          holdersMap[address].blocks[supplyBlockNumber].holdingPeriod = holdingPeriod;
          holdersMap[address].poolShare = holdersMap[address].poolShare.plus(poolShare.times(holdingPeriod));
          holdersMap[address].holdingPeriod = holdersMap[address].holdingPeriod.plus(holdingPeriod);
        }

        if (debugLog){
          console.log('FIN', address, parseInt(holdersMap[address].blockNumber), supplyBlockNumber, parseInt(endBlock), momentjs(parseInt(holdersMap[address].blocks[supplyBlockNumber].startTime)*1000).format('DD-MM-YYYY HH:mm'), momentjs(parseInt(holdersMap[address].blocks[supplyBlockNumber].endTime)*1000).format('DD-MM-YYYY HH:mm'), holdingPeriod.toString(), holdersMap[address].total.toString(), prevSupply.toString(), poolShare.toString(), holdersMap[address].holdingPeriod.toString());
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

function getRemainingRewardsPerPool(blockNumber, timeSpan){
  return totalRewardsPerVault.times(timeSpan).div(totalTime)
}

async function getVaultsRewardsBlocks(vaultsSplitRatiosBlocks){

  const allBlocks = Object.keys(vaultsSplitRatiosBlocks).reduce( (allBlocks, cdoName) => {
    return [
      ...allBlocks,
      ...Object.keys(vaultsSplitRatiosBlocks[cdoName]).filter( blockNumber => allBlocks.indexOf(blockNumber) === -1 )
    ]
  }, [])

  if (allBlocks.indexOf(startBlock) === -1){
    allBlocks.push(startBlock)
  }
  if (allBlocks.indexOf(endBlock) === -1){
    allBlocks.push(endBlock)
  }

  blocksTimestamps = await getBlocksTimestamps(allBlocks.sort())

  const vaultsRewardsBlocks = Object.keys(vaultsSplitRatiosBlocks).reduce( (vaultsRewardsBlocks, cdoName) => {
    let prevBlockNumber = startBlock
    let prevTimestamp = blocksTimestamps[prevBlockNumber]
    let totalDistributedRewards = BNify(0)
    let totalDistributedRewardsAA = BNify(0)
    let totalDistributedRewardsBB = BNify(0)
    vaultsRewardsBlocks[cdoName] = Object.keys(vaultsSplitRatiosBlocks[cdoName]).reduce( (vaultRewardsBlock, blockNumber) => {
      const blockTimestamp = blocksTimestamps[blockNumber]
      const timeSpan = blockTimestamp-prevTimestamp
      if (timeSpan>0){
        const vaultSplitRatio = vaultsSplitRatiosBlocks[cdoName][blockNumber].div(100000)
        const remainingRewards = getRemainingRewardsPerPool(blockNumber, timeSpan)
        vaultRewardsBlock[blockNumber] = {
          AA: remainingRewards.times(vaultSplitRatio),
          BB: remainingRewards.times(BNify(1).minus(vaultSplitRatio))
        }

        totalDistributedRewardsAA = totalDistributedRewardsAA.plus(vaultRewardsBlock[blockNumber].AA)
        totalDistributedRewardsBB = totalDistributedRewardsBB.plus(vaultRewardsBlock[blockNumber].BB)
        totalDistributedRewards = totalDistributedRewards.plus(remainingRewards)
        // console.log(cdoName, startBlock, prevBlockNumber, blockNumber, endBlock, blockTimestamp, momentjs(blockTimestamp*1000).format('DD-MM-YYYY HH:mm'), timeSpan, remainingRewards.toFixed(6), vaultSplitRatio.toFixed(6), vaultRewardsBlock[blockNumber].AA.toFixed(6), vaultRewardsBlock[blockNumber].BB.toFixed(6), totalDistributedRewardsAA.toFixed(6), totalDistributedRewardsBB.toFixed(6), totalDistributedRewards.toFixed(6))
        prevTimestamp = blockTimestamp
        prevBlockNumber = blockNumber
      }
      return vaultRewardsBlock
    }, {})
    return vaultsRewardsBlocks
  }, {})

  return vaultsRewardsBlocks
}

async function main(){

  const csv = [
    ['Vault', 'Holder', 'Token Balance', 'Share %', 'OP'].join(',')
  ];

  endBlock = parseInt((await web3.eth.getBlock()).number) // now

  if (endBlock<startBlock) return;

  // Get splitRatios
  const splitRatiosPromises = Object.keys(CDOs).map( cdoName => {
    const cdoData = CDOs[cdoName]
    return getVaultSplitRatios(cdoData).then( result => ({[cdoName]: result}) )
  });

  const vaultsSplitRatiosBlocksResults = await Promise.all(splitRatiosPromises);
  const vaultsSplitRatiosBlocks = vaultsSplitRatiosBlocksResults.reduce( (vaultsSplitRatiosBlocks, result) => {
    return {
      ...vaultsSplitRatiosBlocks,
      ...result
    }
  }, {})

  // Calculate vaults rewards at every splitRatio update
  const vaultsRewardsBlocks = await getVaultsRewardsBlocks(vaultsSplitRatiosBlocks)

  // Get users balances for each transfer
  const balancesPromises = Object.keys(CDOs).reduce( (balancesPromises, cdoName) => {
    const cdoData = CDOs[cdoName]
    return [
      ...balancesPromises,
      getTokenBalances(cdoName, cdoData, cdoData.AA).then( holders => ({[cdoName]: {AA: holders}}) ),
      getTokenBalances(cdoName, cdoData, cdoData.BB).then( holders => ({[cdoName]: {BB: holders}}) ),
    ]
  }, [])

  const balances = await Promise.all(balancesPromises);

  // Assign rewards to users
  balances.forEach( res => {
    Object.keys(res).forEach( cdoName => {

      Object.keys(res[cdoName]).forEach( trancheType => {
        const trancheHolders = res[cdoName][trancheType]

        let prevBlock = null
        let prevSupply = null
        const usersRewards = {}
        const vaultSupplyBlocks = vaultsSuppliesBlocks[cdoName][trancheType]

        Object.keys(vaultsRewardsBlocks[cdoName]).forEach( blockNumber => {
          // Get vault supply the latest block before the rewards block
          const lastSupplyBlock = Object.keys(vaultSupplyBlocks).filter( supplyBlock => +supplyBlock<+blockNumber ).sort().reverse()[0]
          const vaultSupply = vaultSupplyBlocks[lastSupplyBlock]

          const rewardsDistributed = BNify(vaultsRewardsBlocks[cdoName][blockNumber][trancheType])

          let totalPoolShare = BNify(0)
          let totalRewardsDistributed = BNify(0)

          // Get user balances before the rewards block
          const userBalances = Object.keys(trancheHolders).reduce( (userBalances, holderAddr) => {
            const lastHolderBlock = Object.keys(trancheHolders[holderAddr].blocks).filter( holderBlock => +holderBlock<+blockNumber ).sort().reverse()[0]
            if (lastHolderBlock){
              userBalances[holderAddr] = trancheHolders[holderAddr].blocks[lastHolderBlock].balance
            }
            if (userBalances[holderAddr]){
              const userPoolShare = userBalances[holderAddr].div(vaultSupply)
              const userRewards = userPoolShare.times(rewardsDistributed)
              totalPoolShare = totalPoolShare.plus(userPoolShare)
              totalRewardsDistributed = totalRewardsDistributed.plus(userRewards)

              if (!usersRewards[holderAddr]){
                usersRewards[holderAddr] = BNify(0)
              }
              usersRewards[holderAddr] = usersRewards[holderAddr].plus(userRewards)
            }
            return userBalances
          }, {})

          prevBlock = blockNumber
          prevSupply = vaultSupply
        })

        Object.keys(usersRewards).forEach( holderAddr => {
          const holderInfo = trancheHolders[holderAddr]
          if (holderInfo){
            const userRewards = usersRewards[holderAddr]
            const vaultSupply = Object.values(vaultSupplyBlocks).pop()
            const userShare = holderInfo.total.div(vaultSupply).times(100)
            csv.push([`${cdoName}-${trancheType}`, holderAddr, holderInfo.total.toFixed(8), userShare.toFixed(6), userRewards.toFixed(8)]);
          }
        })
      })
    })
  })

  console.log(csv.join("\n"));
}

main();