/** @param {import('pg').Client} DB */
module.exports.migrate = async ({firestore}) => {
    const batch = firestore.batch();

    const createBatch = firestore.collection('data').doc();
    batch.create(createBatch, {key: 'value'});

    const setBatch = firestore.collection('data').doc('one');
    batch.set(setBatch, {key: 'value'});

    const updateBatch = firestore.collection('data').doc('one');
    batch.update(updateBatch, {key: 'value'});

    const deleteBatch = firestore.collection('data').doc('one');
    batch.delete(deleteBatch, {key: 'value'});

    await batch.commit();

    await firestore.collection('data').doc().create({key: 'value'});
    await firestore.collection('data').doc('two').set({key: 'value'});
    await firestore.collection('data').doc('two').update({key: 'updated'});
    await firestore.collection('data').doc('two').delete();
    await firestore.collection('data').add({key: 'value'});
};
