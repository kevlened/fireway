#!/usr/bin/env node

const sade = require('sade');
const fireblaze = require('./index');
const pkg = require('../package.json');

const prog = sade('fireblaze').version(pkg.version);

prog
    .option('--require', 'Requires a module before executing')
    .example('migrate')
    .example('--require="ts-node/register" migrate')

    .command('migrate')
    .option('--path', 'Path to migration files', './migrations')
    .option('--projectId', 'Target firebase project')
    .option('--dryrun', 'Simulates changes')
    .option('--forceWait', 'Forces waiting for migrations that do not strictly manage async calls')
    .option('--quiet', 'disables console debug logging within fireblaze\'s migrate')
    .option('--migrationsCollection', 'Firestore collection to store migration state', 'fireblaze')
    .describe('Migrates schema to the latest version')
    .example('migrate')
    .example('migrate --path=./my-migrations')
    .example('migrate --projectId=my-staging-id')
    .example('migrate --dryrun')
    .example('migrate --forceWait')
    .example('migrate --quiet')
    .example('--require="ts-node/register" migrate')
    .action(async (opts) => {
        try {
            opts.debug = !opts.quiet;
            await fireblaze.migrate(opts)
        } catch (e) {
            console.log('ERROR:', e.message);
            process.exit(1);
        }
    });

prog.parse(process.argv);
