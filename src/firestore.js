'use strict';

const admin = require('firebase-admin');

// TODO: refactor this monster into something more convenient to read
//  maybe something like this:
// proxyFor(admin, 'firestore', ({ firestore }) => {
//     return proxyFor(firestore, 'collection', ({ collection }) => {
//         return proxyFor(collection, 'doc', ({ doc, operator: propertyKey }) => {
//
//         })
//     })
// }))
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

const initFirebaseAdminProxy = (handler, dryRun = false) => new Proxy(admin, {
    get(firebaseAdmin, service) {
        if (service === 'firestore') {
            // as admin.firestore is a function, we must return a function :)
            return function (...args) {
                return new Proxy(firebaseAdmin.firestore.apply(this, args), {
                    get(firestore, fn) {
                        if (fn === 'collection') {
                            return function (...args) {
                                return new Proxy(firestore.collection.apply(firestore, args), {
                                    get(collection, fn) {
                                        if (fn === 'doc') {
                                            return function (...args) {
                                                return new Proxy(collection.doc.apply(collection, args), {
                                                    get(doc, operation) {
                                                        return function (...args) {
                                                            if (['create', 'set', 'update', 'delete'].includes(operation)) {
                                                                if (!dryRun) {
                                                                    handler({ operation, args, path: this.path })
                                                                    return doc[operation].apply(doc, args)
                                                                }
                                                            }

                                                            // TODO: fix promises here
                                                            return doc[operation]
                                                        }
                                                    }
                                                })
                                            }
                                        }
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
                                                if (!dryRun) {
                                                    handler({ operation, args, path: this.path })
                                                    return batch.commit.apply(batch, args)
                                                }
                                            }
                                        }
                                        return batch[fn];
                                    }
                                })
                            }
                        }
                        return firestore[fn];
                    }
                })
            }
        }
        return firebaseAdmin[service];
    }
});

module.exports = {
    getLatestMigration,
    initFirebaseAdminProxy
}