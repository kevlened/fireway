module.exports.migrate = async ({firestore}) => {
    const batch = firestore.batch();

    const one = firestore.collection('data').doc('one');
    batch.set(one, {key: 'value'});

    const two = firestore.collection('data').doc('two');
    batch.set(two, {key: 'value'});

    await batch.commit();

    // const uncommitted = firestore.batch();

    // const one = firestore.collection('data').doc('one');
    // uncommitted.set(one, {key: 'value'});

    // const two = firestore.collection('data').doc('two');
    // uncommitted.set(two, {key: 'value'});
};
