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

const debugLog = false;
const blocksTimestamps = {}

const vaults = {
  /*
  AA_lido_stETH:{
    type: 'AA',
    token:'stETH',
    decimals: 18,
    abi: erc20ABI,
    address:'0x2688fc68c4eac90d9e5e1b94776cf14eade8d877',
    cdoAddress: '0x34dcd573c5de4672c8248cd12a99f875ca112ad8',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x34dcd573c5de4672c8248cd12a99f875ca112ad8'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x2688fc68c4eac90d9e5e1b94776cf14eade8d877')
  },
  BB_lido_stETH:{
    type: 'BB',
    token:'stETH',
    decimals: 18,
    abi: erc20ABI,
    address:'0x3a52fa30c33caf05faee0f9c5dfe5fd5fe8b3978',
    cdoAddress: '0x34dcd573c5de4672c8248cd12a99f875ca112ad8',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x34dcd573c5de4672c8248cd12a99f875ca112ad8'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x3a52fa30c33caf05faee0f9c5dfe5fd5fe8b3978')
  },
  */
  AA_clearpool_portofino_USDC:{
    type: 'AA',
    token:'USDC',
    decimals: 18,
    abi: erc20ABI,
    address:'0x8552801C75C4f2b1Cac088aF352193858B201D4E',
    cdoAddress: '0x8771128e9E386DC8E4663118BB11EA3DE910e528',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x8771128e9E386DC8E4663118BB11EA3DE910e528'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x8552801C75C4f2b1Cac088aF352193858B201D4E')
  },
  BB_clearpool_portofino_USDC:{
    type: 'BB',
    token:'USDC',
    decimals: 18,
    abi: erc20ABI,
    address:'0xafbAeA12DE33bF6B44105Eceecec24B29163077c',
    cdoAddress: '0x8771128e9E386DC8E4663118BB11EA3DE910e528',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x8771128e9E386DC8E4663118BB11EA3DE910e528'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0xafbAeA12DE33bF6B44105Eceecec24B29163077c')
  },
  AA_clearpool_fasanara_USDT:{
    type: 'AA',
    token:'USDT',
    decimals: 18,
    abi: erc20ABI,
    address:'0x50BA0c3f940f0e851f8e30f95d2A839216EC5eC9',
    cdoAddress: '0x94e399Af25b676e7783fDcd62854221e67566b7f',
    cdoContract: new web3.eth.Contract(idleCDOAbi, '0x94e399Af25b676e7783fDcd62854221e67566b7f'),
    trancheContract: new web3.eth.Contract(erc20ABI, '0x50BA0c3f940f0e851f8e30f95d2A839216EC5eC9')
  },
  BB_clearpool_fasanara_USDT:{
    type: 'BB',
    token:'USDT',
    decimals: 18,
    abi: erc20ABI,
    address:'0x7038D2A5323064f7e590EADc0E8833F2613F6317',
    cdoAddress: '0x94e399Af25b676e7783fDcd62854221e67566b7f',
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

async function getVaultSplitRatioBlocks(vaultData, blocks) {
  const promises = blocks.map( blockNumber => vaultData.cdoContract.methods['trancheAPRSplitRatio']().call({}, parseInt(blockNumber)).then( trancheAPRSplitRatio => ({blockNumber, trancheAPRSplitRatio}) ) )
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
    blocksTimestamps[result.blockNumber] = result.timestamp;
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

async function getAAVaultRewardsRatio(vaultData, aaTrancheContract, bbTrancheContract, startBlock, endBlock){
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

async function getTokenBalances(vaultData, startBlock, endBlock) {
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
    vaultBlocksTimestamps,
    vaultSupplies
  ] = await Promise.all([
    getBlocksTimestamps(eventsBlocks.filter( blockNumber => !blocksTimestamps[blockNumber] )),
    getVaultTotalSupplyBlocks(vaultData, eventsBlocks),
  ]);

  // Add new timestamps to blocksTimestamps
  Object.keys(vaultBlocksTimestamps).forEach( (blockNumber) => {
    blocksTimestamps[blockNumber] = vaultBlocksTimestamps[blockNumber]
  })

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

  const startBlock = 111317188; // Optimism
  const totalRewardsPerVault = BNify(3125);
  // const startBlock = 18362962; // Mainnet (7 days ago)
  const endBlock = (await web3.eth.getBlock()).number // now

  if (endBlock<startBlock) return;

  const promises = Object.keys(vaults).map( token => getTokenBalances(vaults[token], startBlock, endBlock).then( holders => ({[token]: holders}) ) )
  const results = await Promise.all(promises);

  // Group vaults by CDO
  const vaultsByCDO = {}
  for (var i = 0; i < results.length; i++) {
    const token = Object.keys(results[i])[0]
    const vaultData = vaults[token]
    const cdoAddr = vaultData.cdoAddress.toLowerCase()
    if (!vaultsByCDO[cdoAddr]){
      vaultsByCDO[cdoAddr] = {
        vaults: {
          AA: null,
          BB: null
        },
        ratios: {
          AA: 0,
          BB: 0
        },
        rewards: {
          AA: 0,
          BB: 0
        }
      }
    }
    vaultsByCDO[cdoAddr].vaults[vaultData.type] = vaultData;
  }

  for(cdoAddr in vaultsByCDO) {
    const aaVaultData = vaultsByCDO[cdoAddr].vaults.AA
    const bbVaultData = vaultsByCDO[cdoAddr].vaults.BB

    vaultsByCDO[cdoAddr].ratios.AA = await getAAVaultRewardsRatio(aaVaultData, aaVaultData.trancheContract, bbVaultData.trancheContract, startBlock, endBlock)
    vaultsByCDO[cdoAddr].ratios.BB = BNify(1).minus(vaultsByCDO[cdoAddr].ratios.AA)
    vaultsByCDO[cdoAddr].rewards.AA = totalRewardsPerVault.times(vaultsByCDO[cdoAddr].ratios.AA)
    vaultsByCDO[cdoAddr].rewards.BB = totalRewardsPerVault.times(vaultsByCDO[cdoAddr].ratios.BB)
    // console.log('vaults rewards', cdoAddr, vaultsByCDO[cdoAddr].ratios.AA.toString(), vaultsByCDO[cdoAddr].ratios.BB.toString(), vaultsByCDO[cdoAddr].rewards.AA.toString(), vaultsByCDO[cdoAddr].rewards.BB.toString())
  }

  for (var i = 0; i < results.length; i++) {
    const tokenBalances = results[i]
    const token = Object.keys(tokenBalances)[0]
    const vaultData = vaults[token]
    const vaultTotalRewards = vaultsByCDO[vaultData.cdoAddress.toLowerCase()].rewards[vaultData.type]
    Object.keys(tokenBalances[token]).map( holder => {
      const holderInfo = tokenBalances[token][holder];
      if (holderInfo.poolShare.gt(0)){
        csv.push([token, vaultData.token, holder, holderInfo.total.toFixed(8), holderInfo.poolShare.times(100).toFixed(8), BNify(vaultTotalRewards).times(holderInfo.poolShare).toFixed(8)]);
      }
    });
  }

  console.log(csv.join("\n"));
}

main();