module.exports.migrate = async ({firestore}) => {
    await firestore.collection('data').add({key: 'value'});
};
