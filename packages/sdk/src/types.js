/**
 * BlobKit SDK Types
 * Comprehensive TypeScript types for the BlobKit blob storage SDK
 */
/**
 * Error codes for BlobKit operations
 */
export var BlobKitErrorCode;
(function (BlobKitErrorCode) {
    BlobKitErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    BlobKitErrorCode["INVALID_PAYLOAD"] = "INVALID_PAYLOAD";
    BlobKitErrorCode["PROXY_NOT_FOUND"] = "PROXY_NOT_FOUND";
    BlobKitErrorCode["CONTRACT_NOT_DEPLOYED"] = "CONTRACT_NOT_DEPLOYED";
    BlobKitErrorCode["PAYMENT_TIMEOUT"] = "PAYMENT_TIMEOUT";
    BlobKitErrorCode["VERIFICATION_FAILED"] = "VERIFICATION_FAILED";
    BlobKitErrorCode["ENVIRONMENT_ERROR"] = "ENVIRONMENT_ERROR";
    BlobKitErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    BlobKitErrorCode["BLOB_TOO_LARGE"] = "BLOB_TOO_LARGE";
    BlobKitErrorCode["INSUFFICIENT_FUNDS"] = "INSUFFICIENT_FUNDS";
    BlobKitErrorCode["JOB_EXPIRED"] = "JOB_EXPIRED";
    BlobKitErrorCode["PROXY_ERROR"] = "PROXY_ERROR";
    BlobKitErrorCode["TRANSACTION_FAILED"] = "TRANSACTION_FAILED";
    BlobKitErrorCode["KZG_ERROR"] = "KZG_ERROR";
})(BlobKitErrorCode || (BlobKitErrorCode = {}));
/**
 * Custom error class for BlobKit operations
 */
export class BlobKitError extends Error {
    constructor(code, message, cause) {
        super(message);
        this.name = 'BlobKitError';
        this.code = code;
        this.cause = cause;
    }
}
//# sourceMappingURL=types.js.map