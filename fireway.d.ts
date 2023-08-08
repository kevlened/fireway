export interface MigrateOptions {
	app: import("firebase-admin").app.App;
	firestore: import("@google-cloud/firestore").Firestore;
	FieldValue: typeof import("@google-cloud/firestore").FieldValue;
	FieldPath: typeof import("@google-cloud/firestore").FieldPath;
	Timestamp: typeof import("@google-cloud/firestore").Timestamp;
	dryrun: boolean;
	migrationsCollection: string;
}
