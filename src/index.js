'use strict';

const os = require('os');
const firestoreService = require('./firestore');
const filesService = require('./files');

const initStats = () => ({
    scannedFilesCount: 0,
    executedFilesCount: 0,
    executedFiles: [],
    create: 0,
    set: 0,
    update: 0,
    delete: 0,
    add: 0
});

async function migrate({ path: dir, dryRun, app, debug = false }) {
    const log = (...args) => debug && console.log(...args);
    const stats = initStats();

    // Load migration files
    let files = await filesService.resolveFiles(dir, log);
    stats.scannedFilesCount = files.length;
    log(`Found ${stats.scannedFilesCount} migration files`);

    // Construct Firestore proxy so we can spy on method calls
    const firestore = firestoreService.initFirebaseAdminProxy(({ operation, args, path }) => {
        log('Firestore change', { operation, args, path });
        stats[operation] += 1;
    }, dryRun).firestore(app);

    // Initialize migrations Firestore collection
    const collection = firestore.collection('fireway');

    // Get the latest migration
    const latestMigration = await firestoreService.getLatestMigration(collection);

    let installedRank;
    if (latestMigration) {
        files = filesService.getFilesNewerThanVersion(files, latestMigration.version);
        installedRank = latestMigration.installed_rank;
    } else {
        installedRank = -1;
    }

    log(`Executing ${files.length} migration files`);

    // Execute migrations
    for (const file of files) {
        stats.executedFilesCount += 1;
        stats.executedFiles.push(file.filename);
        log('Running', file.filename);

        let migrationSucceeded, startedAt, finishedAt, err;
        try {
            const migration = require(file.path);
            startedAt = new Date();
            await migration.migrate({ app, firestore, dryRun });
            migrationSucceeded = true;
        } catch (e) {
            log(`Error in ${file.filename}`, e);
            migrationSucceeded = false;
            err = e;
        } finally {
            finishedAt = new Date();
        }

        // Upload the results
        log(`Uploading the results for ${file.filename}`);
        installedRank += 1;
        await firestoreService.saveMigration({
            file,
            installedRank,
            startedAt,
            executionTime: finishedAt - startedAt,
            succeeded: migrationSucceeded,
            fileChecksum: await filesService.calculateFileHash(file.path),
            executedBy: os.userInfo().username
        }, collection);

        if (!migrationSucceeded) {
            throw err;
        }
    }

    log('Finished all firestore migrations');
    log(`Files scanned:${stats.scannedFilesCount} executed:${stats.executedFilesCount}`);
    log(`Docs added:${stats.add} created:${stats.create} updated:${stats.update} set:${stats.set - stats.executedFilesCount} deleted:${stats.delete}`);

    return stats;
}

module.exports = { migrate };
