#!/usr/bin/env node

const sade = require('sade');
const fireway = require('./index');
const pkg = require('../package.json');

const prog = sade('fireway').version(pkg.version);

prog
    .option('--require', 'Requires a module before executing')
    .example('migrate')
    .example('--require="ts-node/register" migrate')

    .command('migrate')
    .option('--path', 'Path to migration files', './migrations')
    .option('--projectId', 'Target firebase project')
    .option('--dryrun', 'Simulates changes')
    .option('--forceWait', 'Forces waiting for migrations that do not strictly manage async calls')
    .describe('Migrates schema to the latest version')
    .example('migrate')
    .example('migrate --path=./my-migrations')
    .example('migrate --projectId=my-staging-id')
    .example('migrate --dryrun')
    .example('migrate --forceWait')
    .example('--require="ts-node/register" migrate')
    .action(async (opts) => {
        try {
            opts.debug = true;
            await fireway.migrate(opts)
        } catch (e) {
            console.log('ERROR:', e.message);
            process.exit(1);
        }
    });

// prog
//   .command('dryrun')
//   .describe('Show what will change before running the migration')
//   .action(opts => {
//     console.log('~> Drops everything...');
//   });

// prog
//   .command('undo')
//   .describe('Undo versioned migrations until below a target version')
//   .action(opts => {
//     console.log('~> Drops everything...');
//   });

// prog
//   .command('clean')
//   .describe('Drops all objects in the configured schemas')
//   .action(opts => {
//     console.log('~> Drops everything...');
//   });

// prog
//   .command('info')
//   .describe('Prints the details and status information about all the migrations')
//   .action(opts => {
//     console.log('~> Prints table of migration info...');
//   });

// prog
//   .command('validate')
//   .describe('Validates the applied migrations against the available ones')
//   .action(opts => {
//     console.log('~> Validates the migration info...');
//   });

prog.parse(process.argv);
