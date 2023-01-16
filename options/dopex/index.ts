import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, FetchResultOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices"

interface IPurchase {
    ethweeklyputsssovv3V1PurchaseV1Es: {
        transactionHash: string,
        blockNumber: string,
        blockTimestamp: string,
        transactionIndex: string,
        address: string,
        logIndex: string,
        in_epoch: string,
        in_strike: string,
        in_amount: string,
        in_premium: string,
        in_fee: string,
        in_user: string,
        in_sender: string,
    }[]
}

const query = gql`
{
    ethweeklyputsssovv3V1PurchaseV1Es {
        transactionHash
        blockNumber
        blockTimestamp
        transactionIndex
        address
        logIndex
        in_epoch
        in_strike
        in_amount
        in_premium
        in_fee
        in_user
        in_sender
    }
}
`

const normalizeValue = (value: string) => BigNumber(value).dividedBy(1e18)

const endpoints = {
    [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/token-terminal-subgraphs/dopex-v1-arbitrum",
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/token-terminal-subgraphs/dopex-v1-bsc"
};

const prices = {} as IJSON<number>
const getUnderlyingSpotPrice = async (address: string, timestamp: number) => {
    const key = address
    if (!prices[key]) prices[key] = (await getPrices([key], timestamp))[key].price
    return prices[key]
}
const fetch: (chain: string) => Fetch = (chain: string) => async (timestamp) => {
    const timestampFrom = timestamp - 60 * 60 * 24
    const response = await request(endpoints[chain], query, {
        timestampFrom,
        timestampTo: timestamp,
    }) as IPurchase
    const fetchResult: FetchResultOptions = { timestamp: timestampFrom }
    const processed = await response.ethweeklyputsssovv3V1PurchaseV1Es.reduce(async (accP, curr) => {
        const acc = await accP
        const underlyingAssetSpotPrice = await getUnderlyingSpotPrice('ethereum:0x0000000000000000000000000000000000000000', +curr.blockTimestamp)
        acc.notional = acc.notional.plus(
            normalizeValue(curr.in_amount)
                .multipliedBy(underlyingAssetSpotPrice)
        )
        acc.premium = acc.premium.plus(normalizeValue(curr.in_premium))
        return acc
    }, Promise.resolve({ notional: BigNumber(0), premium: BigNumber(0) }) as Promise<{ notional: BigNumber, premium: BigNumber }>)
    fetchResult.dailyNotionalVolume = processed.notional.toString()
    fetchResult.dailyPremiumVolume = processed.premium.toString()
    return fetchResult
}

const adapter: SimpleAdapter = {
    adapter: Object.keys(endpoints).reduce((acc, chain) => {
        acc[chain] = {
            fetch: fetch(chain),
            start: async () => 1651451425
        }
        return acc
    }, {} as SimpleAdapter['adapter'])
};
export default adapter;
