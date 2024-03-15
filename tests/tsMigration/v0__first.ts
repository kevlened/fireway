import { MigrateOptions } from '../../fireblaze';

export async function migrate({firestore} : MigrateOptions) {
    await firestore.collection('data').doc('one').set({key: 'value'});
};
