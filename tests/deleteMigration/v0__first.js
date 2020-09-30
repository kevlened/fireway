module.exports.migrate = async ({firestore}) => {
    await firestore.collection('data').doc('one').set({key: 'value'});
};
