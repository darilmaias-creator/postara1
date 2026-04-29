import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env';

const databaseFilePath = resolve(process.cwd(), env.historyDatabasePath);

mkdirSync(dirname(databaseFilePath), { recursive: true });

let databaseInstance: DatabaseSync | null = null;

export const getAppDatabase = (): DatabaseSync => {
    if (!databaseInstance) {
        databaseInstance = new DatabaseSync(databaseFilePath);
        databaseInstance.exec('PRAGMA journal_mode = WAL;');
        databaseInstance.exec('PRAGMA foreign_keys = ON;');
    }

    return databaseInstance;
};

export const getAppDatabasePath = (): string => databaseFilePath;
