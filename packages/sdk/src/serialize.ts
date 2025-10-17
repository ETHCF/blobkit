import {Signature, ZeroAddress, getBigInt, toBeArray, getNumber, assertArgument, accessListify, isHexString, concat, encodeRlp} from 'ethers';
import type {BigNumberish, AccessListish} from 'ethers';
import type { TransactionRequest, BlobTxData } from './types.js';

const BN_0 = BigInt(0);
const BN_2 = BigInt(2);
const BN_27 = BigInt(27)
const BN_28 = BigInt(28)
const BN_35 = BigInt(35);
const BN_MAX_UINT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

const BLOB_SIZE = 4096 * 32;

function formatNumber(_value: BigNumberish, name: string): Uint8Array {
    const value = getBigInt(_value, "value");
    const result = toBeArray(value);
    assertArgument(result.length <= 32, `value too large`, `tx.${ name }`, value);
    return result;
}

function handleNumber(_value: string, param: string): number {
    if (_value === "0x") { return 0; }
    return getNumber(_value, param);
}

function handleUint(_value: string, param: string): bigint {
    if (_value === "0x") { return BN_0; }
    const value = getBigInt(_value, param);
    assertArgument(value <= BN_MAX_UINT, "value exceeds uint size", param, value);
    return value;
}


function formatAccessList(value: AccessListish): Array<[ string, Array<string> ]> {
    return accessListify(value).map((set) => [ set.address, set.storageKeys ]);
}

function formatHashes(value: Array<string>, param: string): Array<string> {
    assertArgument(Array.isArray(value), `invalid ${ param }`, "value", value);
    for (let i = 0; i < value.length; i++) {
        assertArgument(isHexString(value[i], 32), "invalid ${ param } hash", `value[${ i }]`, value[i]);
    }
    return value;
}

export function SerializeEIP7495(tx: TransactionRequest, sig: null | Signature, blobs: null | Array<BlobTxData>): string {
    const fields: Array<any> = [
        formatNumber(tx.chainId!, "chainId"),
        formatNumber(tx.nonce!, "nonce"),
        formatNumber(tx.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
        formatNumber(tx.maxFeePerGas || 0, "maxFeePerGas"),
        formatNumber(tx.gasLimit!, "gasLimit"),
        (tx.to || ZeroAddress),
        formatNumber(tx.value!, "value"),
        tx.data,
        formatAccessList(tx.accessList || [ ]),
        formatNumber(tx.maxFeePerBlobGas || 0, "maxFeePerBlobGas"),
        formatHashes(tx.blobVersionedHashes || [ ], "blobVersionedHashes")
    ];

    if (sig) {
        fields.push(formatNumber(sig.yParity, "yParity"));
        fields.push(toBeArray(sig.r));
        fields.push(toBeArray(sig.s));

        // We have blobs; return the network wrapped format
        if (blobs) {
            return concat([
                "0x03",
                encodeRlp([
                    fields,
                    formatNumber(tx.wrapperVersion || 1, "wrapperVersion"),
                    blobs.map((b) => b.blob),
                    blobs.map((b) => (b as any).commitment),
                    blobs.map((b) => (b as any).proof),
                ])
            ]);
        }

    }

    return concat([ "0x03", encodeRlp(fields)]);
}

