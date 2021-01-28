'use strict';

const admin = require('firebase-admin');

const getLatestMigration = async collection => {
    const result = await collection
        .orderBy('installed_rank', 'desc')
        .limit(1)
        .get();
    const [latestDoc] = result.docs;
    const latest = latestDoc && latestDoc.data();

    if (latest && !latest.success) {
        throw new Error(`Migration to version ${ latest.version } using ${ latest.script } failed! Please restore backups and roll back database and code!`);
    }
    return latest;
}

const initFirebaseAdminProxy = (onChangeHandler, dryRun = false) => new Proxy(admin, {
    get(firebaseAdmin, service) {
        if (service === 'firestore') {
            // admin.firestore() is a function so we return a function here
            return (...args) => {
                return new Proxy(firebaseAdmin.firestore.apply(this, args), {
                    get(firestore, fn) {
                        if (fn === 'collection') {
                            // admin.firestore().collection() is a function so we return a function here
                            return (...args) => {
                                return new Proxy(firestore.collection.apply(firestore, args), {
                                    get(collection, fn) {
                                        if (fn === 'doc') {
                                            // admin.firestore().collection().doc() is a function so we return a function here
                                            return (...args) => {
                                                return new Proxy(collection.doc.apply(collection, args), {
                                                    get(doc, operation) {
                                                        // admin.firestore().collection().doc().[operation] is a function
                                                        // so if it's one of following, we want to modify the behavior
                                                        // so we return a new function
                                                        if (['create', 'set', 'update', 'delete'].includes(operation)) {
                                                            return (...args) => {
                                                                onChangeHandler({
                                                                    operation,
                                                                    args,
                                                                    path: doc.path,
                                                                    dryRun
                                                                })
                                                                if (!dryRun) {
                                                                    return doc[operation].apply(doc, args);
                                                                }
                                                            }
                                                        }
                                                        // otherwise just return original implementation
                                                        return doc[operation];
                                                    }
                                                })
                                            }
                                        }
                                        // if not a doc, return original implementation
                                        return collection[fn];
                                    }
                                })
                            }
                        } else if (fn === 'batch') {
                            return function (...args) {
                                return new Proxy(firestore.batch.apply(firestore, args), {
                                    get(batch, fn) {
                                        if (fn === 'commit') {
                                            return function (...args) {
                                                onChangeHandler({ operation: 'commit', args, path: this.path, dryRun })
                                                if (!dryRun) {
                                                    return batch.commit.apply(batch, args)
                                                }
                                            }
                                        }
                                        // if not a commit, return original implementation
                                        return batch[fn];
                                    }
                                })
                            }
                        }
                        // if not a collection, return original implementation
                        return firestore[fn];
                    }
                })
            }
        }
        // if not a firestore, return original implementation
        return firebaseAdmin[service];
    }
});

const saveMigration = async ({ file, installedRank, startedAt, executedBy, fileChecksum, executionTime, succeeded }, collection) => {
    const id = `${ installedRank }-${ file.version }-${ file.description }`;
    await collection.doc(id).set({
        installed_rank: installedRank,
        description: file.description,
        version: file.version,
        script: file.filename,
        type: 'js',
        checksum: fileChecksum,
        installed_by: executedBy,
        installed_on: startedAt,
        execution_time: executionTime,
        success: succeeded
    });
}

module.exports = {
    getLatestMigration,
    initFirebaseAdminProxy,
    saveMigration
}