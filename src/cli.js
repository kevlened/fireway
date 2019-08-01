const sade = require('sade');
const fireway = require('./index');
const pkg = require('../package.json');

const prog = sade('fireway').version(pkg.version);

prog
    .command('migrate [dir]')
    .option('--projectId', 'Target firebase project')
    .describe('Migrates schema to the latest version')
    .action(async (dir, opts) => {
        try {
            await fireway.migrate({dir, ...opts})
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

module.exports = prog;
