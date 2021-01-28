const test = require('tape');
const firebase = require('@firebase/rules-unit-testing');
let fireway = require('../');

function wrapper(fn) {
    return async (t) => {
        let result;
        try {
            if (fn) {
                result = await setup();
                await fn({t, ...result});
            }
            t.pass('');
        } catch (e) {
            t.fail(e);
        } finally {
            t.end();
            result.firestore.disableNetwork?.();
        }
    }
}

async function setup() {
    // Clear the require cache
    Object.keys(require.cache).map(key => { delete require.cache[key]; });
    fireway = require('../');

    const projectId = `fireway-test-${Date.now()}`;
    const app = await firebase.initializeAdminApp({projectId});
    const firestore = app.firestore();
    return {projectId, firestore, app};
}

async function assertData(t, firestore, path, value) {
    const ref = await firestore.doc(path).get();
    t.equal(ref.exists, true);
    const data = ref.data();

    if (value.execution_time) {
        t.equal('execution_time' in data, true);
        t.equal(typeof data.execution_time, 'number');
        delete data.execution_time;
        delete value.execution_time;
    }

    if (value.installed_on) {
        t.equal('installed_on' in data, true);
        t.equal('seconds' in data.installed_on, true);
        t.equal('nanoseconds' in data.installed_on, true);
        delete data.installed_on;
        delete value.installed_on;
    }

    if (value.installed_by) {
        t.equal('installed_by' in data, true);
        t.equal(typeof data.installed_by, 'string');
        delete data.installed_by;
        delete value.installed_by;
    }

    t.deepEqual(data, value);
}

test('merge: iterative', wrapper(async ({t, projectId, firestore, app}) => {
    // Empty migration
    await fireway.migrate({
        projectId,
        path: __dirname + '/emptyMigration',
        app
    });
    let snapshot = await firestore.collection('fireway').get();
    t.equal(snapshot.size, 0);

    // First migration
    await fireway.migrate({
        projectId,
        path: __dirname + '/oneMigration',
        app
    });
    snapshot = await firestore.collection('fireway').get();
    let dataSnapshot = await firestore.collection('data').get();
    t.equal(snapshot.size, 1);
    t.equal(dataSnapshot.size, 1);
    let [doc1] = dataSnapshot.docs;
    t.deepEqual(doc1.data(), {key: 'value'});
    await assertData(t, firestore, 'fireway/0-0.0.0-first', {
        checksum: '3a29bfbd4a83273c613ca3d9bf40e549',
        description: 'first',
        execution_time: 251,
        installed_by: 'len',
        installed_on: {
            seconds: 1564681117,
            nanoseconds: 401000000
        },
        installed_rank: 0,
        script: 'v0__first.js',
        success: true,
        type: 'js',
        version: '0.0.0'
    });

    // Second migration
    await fireway.migrate({
        projectId,
        path: __dirname + '/iterativeMigration',
        app
    });
    snapshot = await firestore.collection('fireway').get();
    dataSnapshot = await firestore.collection('data').get();
    t.equal(snapshot.size, 2);
    t.equal(dataSnapshot.size, 2);
    doc1 = dataSnapshot.docs[0];
    const doc2 = dataSnapshot.docs[1];
    t.deepEqual(doc1.data(), {key: 'value'});
    t.deepEqual(doc2.data(), {key: 'value'});
    await assertData(t, firestore, 'fireway/1-0.1.0-second', {
        checksum: '95031069f80997d046b3cf405af9b524',
        description: 'second',
        execution_time: 251,
        installed_by: 'len',
        installed_on: {
            seconds: 1564681117,
            nanoseconds: 401000000
        },
        installed_rank: 1,
        script: 'v0.1__second.js',
        success: true,
        type: 'js',
        version: '0.1.0'
    });
}));

test('merge: error iterative', wrapper(async ({t, projectId, firestore, app}) => {
    try {
        await fireway.migrate({
            projectId,
            path: __dirname + '/errorMigration',
            app
        });
        t.fail('Should throw an error');
    } catch (e) {
        const snapshot = await firestore.collection('fireway').get();
        t.equal(snapshot.size, 1);
        await assertData(t, firestore, 'fireway/0-0.0.0-error', {
            checksum: '82c81f69f2c5276ef1eefff58c62ce5a',
            description: 'error',
            execution_time: 251,
            installed_by: 'len',
            installed_on: {
                seconds: 1564681117,
                nanoseconds: 401000000
            },
            installed_rank: 0,
            script: 'v0__error.js',
            success: false,
            type: 'js',
            version: '0.0.0'
        });
    }

    try {
        await fireway.migrate({
            projectId,
            path: __dirname + '/errorIterativeMigration',
            app
        });
        t.fail('Should throw an error');
    } catch (e) {
        const snapshot = await firestore.collection('fireway').get();
        const dataSnapshot = await firestore.collection('data').get();
        t.equal(snapshot.size, 1);
        t.equal(dataSnapshot.size, 0);
    }
}));

test('dryRun', wrapper(async ({t, projectId, firestore, app}) => {
    await fireway.migrate({
        dryRun: true,
        projectId,
        path: __dirname + '/oneMigration',
        app
    });

    snapshot = await firestore.collection('fireway').get();
    let dataSnapshot = await firestore.collection('data').get();
    t.equal(snapshot.size, 0);
    t.equal(dataSnapshot.size, 0);
}));

test('dryRun: delete', wrapper(async ({t, projectId, firestore, app}) => {
    await fireway.migrate({
        projectId,
        path: __dirname + '/oneMigration',
        app
    });

    let snapshot = await firestore.collection('fireway').get();
    let dataSnapshot = await firestore.collection('data').get();
    t.equal(snapshot.size, 1);
    t.equal(dataSnapshot.size, 1);

    await fireway.migrate({
        dryRun: true,
        projectId,
        path: __dirname + '/deleteMigration',
        app
    });

    snapshot = await firestore.collection('fireway').get();
    dataSnapshot = await firestore.collection('data').get();
    t.equal(snapshot.size, 1);
    t.equal(dataSnapshot.size, 1);
}));

test('invalid name', wrapper(async ({t, projectId, firestore, app}) => {
    try {
        await fireway.migrate({
            projectId,
            path: __dirname + '/invalidNameMigration',
            app
        });
        t.fail('Should throw an error');
    } catch (e) {
        t.assert(/This filename doesn't match the required format.*/.test(e.message));
        const snapshot = await firestore.collection('fireway').get();
        t.equal(snapshot.size, 0);
    }
}));
