"use strict";
/**
 * Base AI Provider Implementation
 *
 * This file contains the base class for AI providers with shared functionality
 * and common error handling patterns.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProvider = exports.ProviderError = exports.ProviderErrorType = void 0;
/**
 * Common error types across providers
 */
var ProviderErrorType;
(function (ProviderErrorType) {
    ProviderErrorType["InvalidApiKey"] = "invalid_api_key";
    ProviderErrorType["RateLimit"] = "rate_limit";
    ProviderErrorType["InvalidRequest"] = "invalid_request";
    ProviderErrorType["ServerError"] = "server_error";
    ProviderErrorType["NetworkError"] = "network_error";
})(ProviderErrorType || (exports.ProviderErrorType = ProviderErrorType = {}));
/**
 * Base error class for provider-specific errors
 */
var ProviderError = /** @class */ (function (_super) {
    __extends(ProviderError, _super);
    function ProviderError(type, message, statusCode) {
        var _this = _super.call(this, message) || this;
        _this.type = type;
        _this.statusCode = statusCode;
        _this.name = 'ProviderError';
        return _this;
    }
    return ProviderError;
}(Error));
exports.ProviderError = ProviderError;
/**
 * Base class for AI providers implementing common functionality
 */
var BaseProvider = /** @class */ (function () {
    function BaseProvider() {
    }
    /**
     * Handle common HTTP errors
     */
    BaseProvider.prototype.handleHttpError = function (error) {
        // Handle Response objects from fetch API
        if (error instanceof Response) {
            var status_1 = error.status;
            switch (status_1) {
                case 401:
                    throw new ProviderError(ProviderErrorType.InvalidApiKey, 'Invalid API key', status_1);
                case 429:
                    throw new ProviderError(ProviderErrorType.RateLimit, 'Rate limit exceeded', status_1);
                case 400:
                    throw new ProviderError(ProviderErrorType.InvalidRequest, 'Invalid request', status_1);
                case 500:
                case 502:
                case 503:
                case 504:
                    throw new ProviderError(ProviderErrorType.ServerError, 'Server error occurred', status_1);
                default:
                    throw new ProviderError(ProviderErrorType.ServerError, "Unknown error occurred: ".concat(status_1), status_1);
            }
        }
        // Handle error objects with response property (like Axios errors)
        if (!error.response) {
            throw new ProviderError(ProviderErrorType.NetworkError, 'Network error occurred');
        }
        var status = error.response.status;
        switch (status) {
            case 401:
                throw new ProviderError(ProviderErrorType.InvalidApiKey, 'Invalid API key', status);
            case 429:
                throw new ProviderError(ProviderErrorType.RateLimit, 'Rate limit exceeded', status);
            case 400:
                throw new ProviderError(ProviderErrorType.InvalidRequest, 'Invalid request', status);
            case 500:
            case 502:
            case 503:
            case 504:
                throw new ProviderError(ProviderErrorType.ServerError, 'Server error occurred', status);
            default:
                throw new ProviderError(ProviderErrorType.ServerError, "Unknown error occurred: ".concat(status), status);
        }
    };
    /**
     * Format error message for connection test results
     */
    BaseProvider.prototype.formatErrorMessage = function (error) {
        if (error instanceof ProviderError) {
            switch (error.type) {
                case ProviderErrorType.InvalidApiKey:
                    return 'Invalid API key. Please check your credentials.';
                case ProviderErrorType.RateLimit:
                    return 'Rate limit exceeded. Please try again later.';
                case ProviderErrorType.NetworkError:
                    return 'Network error. Please check your internet connection.';
                default:
                    return error.message;
            }
        }
        return error.message || 'An unknown error occurred';
    };
    /**
     * Create a standard error response for connection tests
     */
    BaseProvider.prototype.createErrorResponse = function (error) {
        return {
            success: false,
            message: this.formatErrorMessage(error)
        };
    };
    return BaseProvider;
}());
exports.BaseProvider = BaseProvider;
