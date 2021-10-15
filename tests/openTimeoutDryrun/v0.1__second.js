module.exports.migrate = async ({firestore}) => {
  Promise.all([firestore.collection('data').doc('one').update('key', 'value2')]);
};
