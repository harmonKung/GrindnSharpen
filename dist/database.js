"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.getClient = exports.default = void 0;
var database_1 = require("./db/database");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(database_1).default; } });
Object.defineProperty(exports, "getClient", { enumerable: true, get: function () { return database_1.getClient; } });
Object.defineProperty(exports, "query", { enumerable: true, get: function () { return database_1.query; } });
