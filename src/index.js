const path = require('path');
const util = require('util');
const os = require('os');
const fs = require('fs');
const md5 = require('md5');
const admin = require('firebase-admin');
const {Firestore, DocumentReference, CollectionReference, WriteBatch, FieldValue, FieldPath, Timestamp} = require('@google-cloud/firestore');
const semver = require('semver');

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const exists = util.promisify(fs.exists);

// Track stats and dryrun setting so we only proxy once.
// Multiple proxies would create a memory leak.
const statsDryrunMap = new Map();

let proxied = false;
function proxyWritableMethods() {
    // Only proxy once
    if (proxied) return;
    else proxied = true;

    const ogCommit = WriteBatch.prototype._commit;
    WriteBatch.prototype._commit = async function() {
        for (const [stats, dryrun] of statsDryrunMap.entries()) {
            if (this._firestore._fireway_stats === stats) {
                if (dryrun) return [];
            }
        }
        return ogCommit.apply(this, Array.from(arguments));
    };

    // Add logs for each item
    const ogCreate = DocumentReference.prototype.create;
    DocumentReference.prototype.create = function(doc) {
        for (const stats of statsDryrunMap.keys()) {
            if (this._firestore._fireway_stats === stats) {
                stats.created += 1;
                console.log('Creating', JSON.stringify(doc));
            }
        }
        return ogCreate.call(this, doc);
    };

    const ogSet = DocumentReference.prototype.set;
    DocumentReference.prototype.set = function(doc, opts = {}) {
        for (const stats of statsDryrunMap.keys()) {
            if (this._firestore._fireway_stats === stats) {    
                stats.set += 1;
                console.log(opts.merge ? 'Merging' : 'Setting', this.path, JSON.stringify(doc));
            }
        }
        return ogSet.call(this, doc, opts);
    };

    const ogUpdate = DocumentReference.prototype.update;
    DocumentReference.prototype.update = function(doc) {
        for (const stats of statsDryrunMap.keys()) {
            if (this._firestore._fireway_stats === stats) {
                stats.updated += 1;
                console.log('Updating', this.path, JSON.stringify(doc));
            }
        }
        return ogUpdate.call(this, doc);
    };

    const ogDelete = DocumentReference.prototype.delete;
    DocumentReference.prototype.delete = function() {
        for (const stats of statsDryrunMap.keys()) {
            if (this._firestore._fireway_stats === stats) {
                stats.deleted += 1;
                console.log('Deleting', this.path);
            }
        }
        return ogDelete.call(this);
    };
    
    const ogAdd = CollectionReference.prototype.add;
    CollectionReference.prototype.add = function(doc) {
        for (const stats of statsDryrunMap.keys()) {
            if (this._firestore._fireway_stats === stats) {
                stats.added += 1;
                console.log('Adding', JSON.stringify(doc));
            }
        }
        return ogAdd.call(this, doc);
    };
}

async function migrate({path: dir, projectId, storageBucket, dryrun, app} = {}) {
    const stats = {
        scannedFiles: 0,
        executedFiles: 0,
        created: 0,
        set: 0,
        updated: 0,
        deleted: 0,
        added: 0
    };

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
    let files = filenames.map(filename => {
        // Skip files that start with a dot
        if (filename[0] === '.') return;
        
        const [filenameVersion, description] = filename.split('__');
        const coerced = semver.coerce(filenameVersion);

        if (!coerced) {
            if (description) {
                // If there's a description, we assume you meant to use this file
                console.log(`WARNING: ${filename} doesn't have a valid semver version`);
            }
            return null;
        }

        // If there's a version, but no description, we have an issue
        if (!description) {
            throw new Error(`This filename doesn't match the required format: ${filename}`);
        }

        const {version} = coerced;

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
    }).filter(Boolean);

    stats.scannedFiles = files.length;
    console.log(`Found ${stats.scannedFiles} migration files`);

    // Find the files after the latest migration number
    statsDryrunMap.set(stats, dryrun);
    dryrun && console.log('Making firestore read-only');
    proxyWritableMethods();

    if (!storageBucket && projectId) {
        storageBucket = `${projectId}.appspot.com`;
    }
    
    const providedApp = app;
    if (!app) {
        app = admin.initializeApp({
            projectId,
            storageBucket
        });
    }

    // Use Firestore directly so we can mock for dryruns
    const firestore = new Firestore({projectId});
    firestore._fireway_stats = stats;

    const collection = firestore.collection('fireway');

    // Get the latest migration
    const result = await collection
        .orderBy('installed_rank', 'desc')
        .limit(1)
        .get();
    const [latestDoc] = result.docs;
    const latest = latestDoc && latestDoc.data();

    if (latest && !latest.success) {
        throw new Error(`Migration to version ${latest.version} using ${latest.script} failed! Please restore backups and roll back database and code!`);
    }

    let installed_rank;
    if (latest) {
        files = files.filter(file => semver.gt(file.version, latest.version));
        installed_rank = latest.installed_rank;
    } else {
        installed_rank = -1;
    }

    // Sort them by semver
    files.sort((f1, f2) => semver.compare(f1.version, f2.version));

    console.log(`Executing ${files.length} migration files`);

    // Execute them in order
    for (const file of files) {
        stats.executedFiles += 1;
        console.log('Running', file.filename);
        
        let migration;
        try {
            migration = require(file.path);
        } catch (e) {
            console.log(e);
            throw e;
        }

        const start = new Date();
        let success, finish;
        try {
            await migration.migrate({app, firestore, FieldValue, FieldPath, Timestamp, dryrun});
            success = true;
        } catch(e) {
            console.log(`Error in ${file.filename}`, e);
            success = false;
        } finally {
            finish = new Date();
        }

        // Upload the results
        console.log(`Uploading the results for ${file.filename}`);

        installed_rank += 1;
        const id = `${installed_rank}-${file.version}-${file.description}`;
        await collection.doc(id).set({
            installed_rank,
            description: file.description,
            version: file.version,
            script: file.filename,
            type: 'js',
            checksum: md5(await readFile(file.path)),
            installed_by: os.userInfo().username,
            installed_on: start,
            execution_time: finish - start,
            success
        });

        if (!success) {
            throw new Error('Stopped at first failure');
        }
    }

    // Ensure firebase terminates
    if (!providedApp) {
        app.delete();
    }

    const {scannedFiles, executedFiles, added, created, updated, set, deleted} = stats;
    console.log('Finished all firestore migrations');
    console.log(`Files scanned:${scannedFiles} executed:${executedFiles}`);
    console.log(`Docs added:${added} created:${created} updated:${updated} set:${set - executedFiles} deleted:${deleted}`);

    statsDryrunMap.delete(stats);

    return stats;
}

module.exports = {migrate};
