'use strict';

const path = require('path');
const util = require('util');
const os = require('os');
const fs = require('fs');
const md5 = require('md5');
const semver = require('semver');
const firestoreService = require('./firestore');

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const exists = util.promisify(fs.exists);

const getFilesNewerThanVersion = (files, version) => files.filter(file => semver.gt(file.version, version));

const resolveFiles = async (dir, log) => {
    // Get all the scripts
    if (!path.isAbsolute(dir)) {
        dir = path.join(process.cwd(), dir);
    }

    if (!(await exists(dir))) {
        throw new Error(`No directory at ${dir}`);
    }

    const filenames = [];
    for (const file of await readdir(dir)) {
        if (!(await stat(path.join(dir, file))).isDirectory()) {
            filenames.push(file);
        }
    }

    // Parse the version numbers from the script filenames
    const versionToFile = new Map();
    return filenames
        .map(filename => {
            // Skip files that start with a dot
            if (filename[0] === '.') return;

            const [filenameVersion, description] = filename.split('__');
            const coerced = semver.coerce(filenameVersion);

            if (!coerced) {
                if (description) {
                    // If there's a description, we assume you meant to use this file
                    log(`WARNING: ${filename} doesn't have a valid semver version`);
                }
                return null;
            }

            // If there's a version, but no description, we have an issue
            if (!description) {
                throw new Error(`This filename doesn't match the required format: ${filename}`);
            }

            const { version } = coerced;

            const existingFile = versionToFile.get(version);
            if (existingFile) {
                throw new Error(`Both ${filename} and ${existingFile} have the same version`);
            }
            versionToFile.set(version, filename);

            return {
                filename,
                path: path.join(dir, filename),
                version,
                description: path.basename(description, '.js')
            };
        })
        .filter(Boolean)
        // sort files by semver
        .sort((f1, f2) => semver.compare(f1.version, f2.version));
}

async function migrate({ path: dir, dryRun, app, debug = false }) {
    const log = (...args) => debug && console.log(...args)
    const stats = {
        scannedFilesCount: 0,
        executedFilesCount: 0,
        executedFiles: [],
        create: 0,
        set: 0,
        update: 0,
        delete: 0,
        add: 0
    };

    // Load migration files
    let files = await resolveFiles(dir, log);
    stats.scannedFilesCount = files.length;
    log(`Found ${stats.scannedFilesCount} migration files`);

    // Construct Firestore proxy so we can spy on method calls
    const firestore = firestoreService.initFirebaseAdminProxy(({ operation, args, path }) => {
        log('Firestore change', { operation, args, path })
        stats[operation] += 1
    }).firestore(app);

    // Initialize migrations Firestore collection
    const collection = firestore.collection('fireway');

    // TODO: this is not working properly, there is some issue with resolving .then() in proxy
    // try {
    //     await collection.add({ test: 'new ' })
    // } catch (err) {
    //     log('err', err)
    // }
    // log('here')
    // process.exit(1)

    // Get the latest migration
    const latestMigration = await firestoreService.getLatestMigration(collection);

    let installedRank;
    if (latestMigration) {
        files = getFilesNewerThanVersion(files, latestMigration.version);
        installedRank = latestMigration.installed_rank;
    } else {
        installedRank = -1;
    }

    log(`Executing ${files.length} migration files`);

    // Execute them in order
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
        const id = `${installedRank}-${file.version}-${file.description}`;
        await collection.doc(id).set({
            installed_rank: installedRank,
            description: file.description,
            version: file.version,
            script: file.filename,
            type: 'js',
            checksum: md5(await readFile(file.path)),
            installed_by: os.userInfo().username,
            installed_on: startedAt,
            execution_time: finishedAt - startedAt,
            success: migrationSucceeded
        });

        if (!migrationSucceeded) {
            throw err;
        }
    }

    log('Finished all firestore migrations');
    log(`Files scanned:${stats.scannedFilesCount} executed:${stats.executedFilesCount}`);
    log(`Docs added:${stats.add} created:${stats.create} updated:${stats.update} set:${stats.set - stats.executedFiles} deleted:${stats.delete}`);

    return stats;
}

module.exports = { migrate };
