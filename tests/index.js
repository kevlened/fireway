const test = require('tape');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const terminal = require('./console-tester');
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
			result.firestore.disableNetwork && result.firestore.disableNetwork();
		}
	}
}

async function setup() {
	// Clear the require cache
	Object.keys(require.cache).map(key => { delete require.cache[key]; });
	fireway = require('../');

	// Clear the terminal tracking
	terminal.reset();

	const projectId = `fireway-test-${Date.now()}`;
	const testEnv = await initializeTestEnvironment({projectId});
	const firestore = testEnv.unauthenticatedContext().firestore();
	return {projectId, firestore, app: null};
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
	const stats0 = await fireway.migrate({
		projectId,
		path: __dirname + '/emptyMigration',
		app
	});
	let snapshot = await firestore.collection('fireway').get();
	t.equal(snapshot.size, 0);

	// First migration
	const stats1 = await fireway.migrate({
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
	const stats2 = await fireway.migrate({
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

	t.deepEqual(stats0, {
		scannedFiles: 0,
		executedFiles: 0,
		created: 0,
		set: 0,
		updated: 0,
		deleted: 0,
		added: 0
	});
	t.deepEqual(stats1, {
		scannedFiles: 1,
		executedFiles: 1,
		created: 0,
		set: 1,
		updated: 0,
		deleted: 0,
		added: 0
	});
	t.deepEqual(stats2, {
		scannedFiles: 2,
		executedFiles: 1,
		created: 0,
		set: 1,
		updated: 0,
		deleted: 0,
		added: 0
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

test('dryrun', wrapper(async ({t, projectId, firestore, app}) => {
	await fireway.migrate({
		dryrun: true,
		projectId,
		path: __dirname + '/oneMigration',
		app
	});

	snapshot = await firestore.collection('fireway').get();
	let dataSnapshot = await firestore.collection('data').get();
	t.equal(snapshot.size, 0);
	t.equal(dataSnapshot.size, 0);
}));

test('dryrun: delete', wrapper(async ({t, projectId, firestore, app}) => {
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
		dryrun: true,
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

test('batch: migration count', wrapper(async ({t, projectId, firestore, app}) => {
	const stats = await fireway.migrate({
		projectId,
		path: __dirname + '/batchMigration',
		app
	});

	snapshot = await firestore.collection('fireway').get();
	let dataSnapshot = await firestore.collection('data').get();
	t.equal(snapshot.size, 1);
	t.equal(dataSnapshot.size, 2);
	t.deepEqual(stats, {
		scannedFiles: 1,
		executedFiles: 1,
		created: 0,
		set: 2,
		updated: 0,
		deleted: 0,
		added: 0
	});
}));

test('all methods', wrapper(async ({t, projectId, firestore, app}) => {
	const stats = await fireway.migrate({
		projectId,
		path: __dirname + '/allMethodMigration',
		app
	});

	const snapshot = await firestore.collection('fireway').get();
	let dataSnapshot = await firestore.collection('data').get();
	t.equal(snapshot.size, 1);
	t.equal(dataSnapshot.size, 3);
	t.deepEqual(stats, {
		scannedFiles: 1,
		executedFiles: 1,
		created: 2,
		set: 2,
		updated: 2,
		deleted: 2,
		added: 1
	});
}));

test('async: unhandled async warning', wrapper(async ({t, projectId, app}) => {
	await fireway.migrate({
		projectId,
		path: __dirname + '/openTimeoutMigration',
		app
	});

	t.equal(
		terminal.includes('WARNING: fireway detected open async calls'),
		true
	);
}));

test('async: handle unhandled async', wrapper(async ({t, projectId, app}) => {
	await fireway.migrate({
		projectId,
		path: __dirname + '/openTimeoutMigration',
		app,
		forceWait: true
	});

	t.equal(
		terminal.includes('WARNING: fireway detected open async calls'),
		false
	);
}));

test('async: handle unhandled async error', wrapper(async ({t, projectId, firestore, app}) => {
	try {
		await fireway.migrate({
			projectId,
			path: __dirname + '/openTimeoutFailureMigration',
			app,
			forceWait: true
		});
		t.fail('Should throw an error');
	} catch (e) {
		const snapshot = await firestore.collection('fireway').get();
		t.equal(snapshot.size, 1);
		await assertData(t, firestore, 'fireway/0-0.0.0-error', {
			checksum: '195c7acd6b71af2f4cae0c422032781e',
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
}));

test('async: unhandled async in dryrun', wrapper(async ({t, projectId, firestore, app}) => {
	await fireway.migrate({
		projectId,
		path: __dirname + '/oneMigration',
		app
	});

	await fireway.migrate({
		dryrun: true,
		projectId,
		path: __dirname + '/openTimeoutDryrun',
		app
	});

	const snapshot = await firestore.collection('fireway').get();
	const dataSnapshot = await firestore.collection('data').get();
	const [doc1] = dataSnapshot.docs;
	t.equal(snapshot.size, 1);
	t.deepEqual(doc1.data(), {key: 'value'});
	t.equal(
		terminal.includes('WARNING: fireway detected open async calls'),
		true
	);
}));

test('Delete a field', wrapper(async ({t, projectId, firestore, app}) => {
	await firestore.collection('data').doc('doc').set({
		field1: 'field1',
		field2: 'field2'
	})

	await fireway.migrate({
		projectId,
		path: __dirname + '/deleteFieldMigration',
		app
	});

	snapshot = await firestore.collection('fireway').get();
	let dataSnapshot = await firestore.collection('data').get();
	t.equal(snapshot.size, 1);
	t.equal(dataSnapshot.size, 1);
	await assertData(t, firestore, 'data/doc', {
		field2: 'field2'
	});
}));

test('TypeScript (run all TS last for perf reasons and only require TS once)', wrapper(async ({t, projectId, firestore, app}) => {
	const stats = await fireway.migrate({
		projectId,
		path: __dirname + '/tsMigration',
		app,
		require: 'ts-node/register'
	});

	const snapshot = await firestore.collection('fireway').get();
	let dataSnapshot = await firestore.collection('data').get();
	t.equal(snapshot.size, 1);
	t.equal(dataSnapshot.size, 1);
	t.deepEqual(stats, {
		scannedFiles: 1,
		executedFiles: 1,
		created: 0,
		set: 1,
		updated: 0,
		deleted: 0,
		added: 0
	});

	await assertData(t, firestore, 'fireway/0-0.0.0-first', {
		checksum: 'e54bcdef27f8938eefbdafc5ed32341a',
		description: 'first',
		execution_time: 251,
		installed_by: 'len',
		installed_on: {
			seconds: 1564681117,
			nanoseconds: 401000000
		},
		installed_rank: 0,
		script: 'v0__first.ts',
		success: true,
		type: 'ts',
		version: '0.0.0'
	});
}));

test('TypeScript: unhandled async warning', wrapper(async ({t, projectId, app}) => {
	await fireway.migrate({
		projectId,
		path: __dirname + '/tsOpenTimeoutMigration',
		app
	});

	t.equal(
		terminal.includes('WARNING: fireway detected open async calls'),
		true
	);
}));

test('TypeScript: handle unhandled async', wrapper(async ({t, projectId, app}) => {
	await fireway.migrate({
		projectId,
		path: __dirname + '/tsOpenTimeoutMigration',
		app,
		forceWait: true
	});

	t.equal(
		terminal.includes('WARNING: fireway detected open async calls'),
		false
	);
}));

test('TypeScript: handle unhandled async error', wrapper(async ({t, projectId, firestore, app}) => {
	try {
		await fireway.migrate({
			projectId,
			path: __dirname + '/tsOpenTimeoutFailureMigration',
			app,
			forceWait: true
		});
		t.fail('Should throw an error');
	} catch (e) {
		const snapshot = await firestore.collection('fireway').get();
		t.equal(snapshot.size, 1);
		await assertData(t, firestore, 'fireway/0-0.0.0-error', {
			checksum: 'e26a1eaed0c4f9549f6902001139cfb4',
			description: 'error',
			execution_time: 251,
			installed_by: 'len',
			installed_on: {
				seconds: 1564681117,
				nanoseconds: 401000000
			},
			installed_rank: 0,
			script: 'v0__error.ts',
			success: false,
			type: 'ts',
			version: '0.0.0'
		});
	}
}));
