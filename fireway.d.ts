export interface MigrateOptions {
	app: import("firebase-admin/app").App;
	firestore: import("firebase-admin/firestore").Firestore;
	FieldValue: typeof import("firebase-admin/firestore").FieldValue;
	FieldPath: typeof import("firebase-admin/firestore").FieldPath;
	Timestamp: typeof import("firebase-admin/firestore").Timestamp;
	dryrun: boolean;
}
