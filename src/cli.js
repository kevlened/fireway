#!/usr/bin/env node

const sade = require('sade');
const admin = require('firebase-admin');
const fireway = require('./index');
const pkg = require('../package.json');

const prog = sade('fireway').version(pkg.version);

prog
    .command('migrate')
    .option('--path', 'Path to migration files', './migrations')
    .option('--dryRun', 'Simulates changes')
    .describe('Migrates schema to the latest version')
    .example('migrate')
    .example('migrate --path=./my-migrations')
    .example('migrate --projectId=my-staging-id')
    .example('migrate --dryRun')
    .action(async (opts) => {
        try {
            // Requires env variable GOOGLE_APPLICATION_CREDENTIALS to be set
            // See https://firebase.google.com/docs/admin/setup#initialize-without-parameters
            const app = admin.initializeApp();
            await fireway.migrate({ ...opts, debug: true, app });
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
