module.exports.migrate = async ({firestore}) => {
    const batch = firestore.batch();

    const one = firestore.collection('data').doc('one');
    batch.set(one, {key: 'value'});

    const two = firestore.collection('data').doc('two');
    batch.set(two, {key: 'value'});

    await batch.commit();

    const uncommitted = firestore.batch();

    const three = firestore.collection('data').doc('three');
    uncommitted.set(three, {key: 'value'});

    const four = firestore.collection('data').doc('four');
    uncommitted.set(four, {key: 'value'});
};
