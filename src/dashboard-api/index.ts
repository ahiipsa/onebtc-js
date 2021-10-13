import axios from 'axios';
import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import {
  IBtcRelayInfo,
  IEvent,
  IIssue,
  IListContainer,
  IRedeem,
  IVault,
} from './interfaces';
import { getActualOutputs } from './helpers';
import { BTCNodeClient } from '../btcNode';

export interface IDashboardApi {
  dashboardUrl: string;
  btcNodeUrl: string;
}

export interface IGetParams {
  page: number;
  size: number;
  vault?: string;
  id?: string;
  requester?: string;
}

interface IFreeOutput {
  id: any; // secretKey
  value: number;
  hex: string;
  hash: string;
  index: number;
  bech32Address: string;
}

enum DATA_TYPE {
  ISSUES = 'issues',
  REDEEMS = 'redeems',
  VAULTS = 'vaults',
  EVENTS = 'relay/events',
}

export class DashboardApi {
  dashboardUrl: string;
  btcNodeUrl: string;
  btcNodeClient: BTCNodeClient;

  constructor(params: IDashboardApi) {
    this.dashboardUrl = params.dashboardUrl;
    this.btcNodeUrl = params.btcNodeUrl;

    this.btcNodeClient = new BTCNodeClient(this.btcNodeUrl);
  }

  loadDataList = async <T>(
    dataType: DATA_TYPE,
    params: IGetParams,
  ): Promise<IListContainer<T>> => {
    const res = await axios.get(`${this.dashboardUrl}/${dataType}/data`, {
      params,
    });

    return res.data;
  };

  loadData = async (dataType: DATA_TYPE, entityId: string) => {
    const res = await axios.get(
      `${this.dashboardUrl}/${dataType}/data/${entityId}`,
    );
    return res.data;
  };

  loadIssue = async (issueId: string): Promise<IIssue> => {
    return await this.loadData(DATA_TYPE.ISSUES, issueId);
  };

  loadRedeem = async (redeemId: string): Promise<IRedeem> => {
    return await this.loadData(DATA_TYPE.ISSUES, redeemId);
  };

  loadVault = async (vaultId: string): Promise<IVault> => {
    return await this.loadData(DATA_TYPE.VAULTS, vaultId);
  };

  loadEvent = async (eventId: string): Promise<IEvent> => {
    return await this.loadData(DATA_TYPE.EVENTS, eventId);
  };

  loadEventList = async (params: IGetParams) => {
    return this.loadDataList<IEvent>(DATA_TYPE.EVENTS, params);
  };

  loadIssueList = (params: IGetParams) => {
    return this.loadDataList<IIssue>(DATA_TYPE.ISSUES, params);
  };

  loadRedeemList = (params: IGetParams) => {
    return this.loadDataList<IRedeem>(DATA_TYPE.REDEEMS, params);
  };

  loadVaultList = (params: IGetParams) => {
    return this.loadDataList<IVault>(DATA_TYPE.VAULTS, params);
  };

  getVaultFreeOutputs = async (vault: string): Promise<IFreeOutput[]> => {
    const issues = await this.loadIssueList({ page: 0, size: 500, vault });

    const freeOutputs: IFreeOutput[] = [];
    let totalAmount = 0;
    let i = 0;
    const amount = 0;
    const getMax = true;

    while ((getMax || totalAmount < amount) && i < issues.content.length) {
      const issue = issues.content[i];

      const bech32Address = bitcoin.address.toBech32(
        Buffer.from(issue.btcAddress.slice(2), 'hex'),
        0,
        'tb',
      );
      const txs = await this.btcNodeClient.loadTxsByAddress(bech32Address);
      const outputs = getActualOutputs(txs, bech32Address);

      outputs.forEach((out) => {
        if (getMax || totalAmount < amount) {
          totalAmount += Number(out.value);
          freeOutputs.push({ ...out, id: issue.id, bech32Address });
        }
      });

      i++;
    }

    if (totalAmount < amount) {
      throw new Error('Vault BTC Balance is too low');
    }

    return freeOutputs;
  };

  loadVaultBalances = async (
    vault: string,
  ): Promise<IListContainer<{ address: string; amount: string }>> => {
    const balances = {};

    const outs = await this.getVaultFreeOutputs(vault);
    outs.forEach(
      (o) =>
        (balances[o.bech32Address] =
          (balances[o.bech32Address] || 0) + o.value),
    );

    const content = Object.keys(balances).map((key) => ({
      address: key,
      amount: balances[key],
    }));
    return {
      size: content.length,
      page: 0,
      totalPages: 1,
      content: content,
      totalElements: content.length,
    };
  };

  public loadInfo = async (): Promise<IBtcRelayInfo> => {
    const res = await axios.get(this.dashboardUrl + '/relay/events/info');

    return res.data;
  };

  public loadLastEvent = async (): Promise<IEvent> => {
    const events = await this.loadEventList({
      size: 1,
      page: 0,
    });
    return events.content[0];
  };
}
