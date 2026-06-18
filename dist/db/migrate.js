"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = require("../database");
async function migrate() {
    console.log('Running database migrations...');
    const schemaPath = path_1.default.resolve(process.cwd(), 'schema.sql');
    const sql = fs_1.default.readFileSync(schemaPath, 'utf8');
    try {
        await (0, database_1.query)(sql);
        console.log('Migrations complete');
        process.exit(0);
    }
    catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}
migrate();
