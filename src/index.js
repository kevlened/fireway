const path = require('path');
const util = require('util');
const os = require('os');
const fs = require('fs');
const md5 = require('md5');
const admin = require('firebase-admin');
const {Firestore, DocumentReference, CollectionReference, WriteBatch, FieldValue, FieldPath} = require('@google-cloud/firestore');
const semver = require('semver');

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const exists = util.promisify(fs.exists);

function proxyWritableMethods(dryrun, stats) {
    dryrun && console.log('Making firestore read-only');

    const ogCommit_ = WriteBatch.prototype.commit_;
    WriteBatch.prototype.commit_ = async function() {
        if (dryrun) return [];
        return ogCommit_.apply(this, Array.from(arguments));
    };

    // Add logs for each item
    const ogCreate = DocumentReference.prototype.create;
    DocumentReference.prototype.create = function(doc) {
        stats.created += 1;
        console.log('Creating', JSON.stringify(doc));
        return ogCreate.call(this, doc);
    };

    const ogSet = DocumentReference.prototype.set;
    DocumentReference.prototype.set = function(doc, opts = {}) {
        stats.set += 1;
        console.log(opts.merge ? 'Merging' : 'Setting', this.path, JSON.stringify(doc));
        return ogSet.call(this, doc, opts);
    };

    const ogUpdate = DocumentReference.prototype.update;
    DocumentReference.prototype.update = function(doc) {
        stats.updated += 1;
        console.log('Updating', this.path, JSON.stringify(doc));
        return ogUpdate.call(this, doc);
    };

    const ogDelete = DocumentReference.prototype.delete;
    DocumentReference.prototype.delete = function() {
        stats.deleted += 1;
        console.log('Deleting', this.path);
        return ogDelete.call(this, doc);
    };
    
    const ogAdd = CollectionReference.prototype.add;
    CollectionReference.prototype.add = function(doc) {
        stats.added += 1;
        console.log('Adding', JSON.stringify(doc));
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
        const [filenameVersion, description] = filename.split('__');
        const coerced = semver.coerce(filenameVersion);
        if (!coerced) {
            console.log(`WARNING: ${filename} doesn't have a valid semver version`);
            return null;
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
    proxyWritableMethods(dryrun, stats);

    if (!storageBucket && projectId) {
        storageBucket = `${projectId}.appspot.com`;
    }
    
    if (!app) {
        app = admin.initializeApp({
            projectId,
            storageBucket
        });
    }

    // Use Firestore directly so we can mock for dryruns
    const firestore = new Firestore({projectId});

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
        const migration = require(file.path);

        const start = new Date();
        let success, finish;
        try {
            await migration.migrate({app, firestore, FieldValue, FieldPath});
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

    const {scannedFiles, executedFiles, added, created, updated, set, deleted} = stats;
    console.log('Finished all firestore migrations');
    console.log(`Files scanned:${scannedFiles} executed:${executedFiles}`);
    console.log(`Docs added:${added} created:${created} updated:${updated} set:${set - executedFiles} deleted:${deleted}`);
}

module.exports = {migrate};
