export interface MigrateOptions {
	app: import("firebase-admin").app.App;
	firestore: import("@google-cloud/firestore").Firestore;
	FieldValue: import("@google-cloud/firestore").FieldValue;
	FieldPath: import("@google-cloud/firestore").FieldPath;
	Timestamp: import("@google-cloud/firestore").Timestamp;
	dryrun: boolean;
}
