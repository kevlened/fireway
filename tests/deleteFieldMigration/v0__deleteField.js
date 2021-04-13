module.exports.migrate = async ({ firestore, FieldValue }) => {
	await firestore.collection('data').doc('doc').update({
		field1: FieldValue.delete()
	});
};
