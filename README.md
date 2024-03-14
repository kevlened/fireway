# fireblaze
A fork of useful (but seemly dead) project [fireblaze](https://github.com/kevlened/fireblaze)

## Install

```bash
yarn global add fireblaze

# or 

npx fireblaze
```

## Credentials

In order to fireblaze be able to connect to firestore you need to set up the environment variable `GOOGLE_APPLICATION_CREDENTIALS` with service account file path.

Example:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="path/to/firestore-service-account.json"
```

## CLI

```bash
Usage
  $ fireblaze <command> [options]

Available Commands
  migrate    Migrates schema to the latest version

For more info, run any command with the `--help` flag
  $ fireblaze migrate --help

Options
  --require        Requires a module before executing
  -v, --version    Displays current version
  -h, --help       Displays this message

Examples
  $ fireblaze migrate
  $ fireblaze --require="ts-node/register" migrate
```

### `fireblaze migrate`
```bash
Description
  Migrates schema to the latest version

Usage
  $ fireblaze migrate [options]

Options
  --path                  Path to migration files  (default ./migrations)
  --projectId             Target firebase project
  --dryrun                Simulates changes
  --forceWait             Forces waiting for migrations that do not strictly manage async calls
  --require               Requires a module before executing
  --migrationsCollection  Firestore collection to store migration state (default fireblaze)
  -h, --help              Displays this message

Examples
  $ fireblaze migrate
  $ fireblaze migrate --path=./my-migrations
  $ fireblaze migrate --projectId=my-staging-id
  $ fireblaze migrate --dryrun
  $ fireblaze migrate --forceWait
  $ fireblaze migrate --migrationsCollection=migrations
  $ fireblaze --require="ts-node/register" migrate
```

## Migration file format

Migration file name format: `v[semver]__[description].js`

```js
// each script gets a pre-configured firestore admin instance
// possible params: app, firestore, FieldValue, FieldPath, Timestamp, dryrun
module.exports.migrate = async ({firestore, FieldValue}) => {
    await firestore.collection('name').add({key: FieldValue.serverTimestamp()});
};
```

## Typed Migrations

For type checking and Intellisense, there are two options:

### TypeScript

1. Ensure [`ts-node`](https://www.npmjs.com/package/ts-node) is installed
2. Define a `ts-node` configuration block inside your `tsconfig.json` file:

   ```json
   {
     "ts-node": {
       "transpileOnly": true,
       "compilerOptions": {
         "module": "commonjs"
       }
     }
   }
   ```
3. Create a migration

   ```ts
    // ./migrations/v0.0.1__typescript-example.ts

    import { MigrateOptions } from 'fireblaze';

    export async function migrate({firestore} : MigrateOptions) {
        await firestore.collection('data').doc('one').set({key: 'value'});
    };
   ```
4. Run `fireblaze migrate` with the `require` option

   ```sh
   $ fireblaze migrate --require="ts-node/register"
   ```

### JSDoc

Alternatively, you can use [JSDoc](https://jsdoc.app/) for Intellisense

```js
/** @param { import('fireblaze').MigrateOptions } */
module.exports.migrate = async ({firestore}) => {
    // Intellisense is enabled
};
```

## Running locally

Typically, `fireblaze` expects a `--projectId` option that lets you specify the Firebase project associated with your Firestore instance against which it performs migrations. 
However, most likely you'll want to test your migration scripts _locally_ first before running them against your actual (presumably, production) instances. 
If you are using the [Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore), define the FIRESTORE_EMULATOR_HOST environment variable, e.g.:

`export FIRESTORE_EMULATOR_HOST="localhost:8080"`

The firestore node library will connect to your local instance. This way, you don't need a project ID and migrations will be run against your emulator instance. This works since `fireblaze` is built on the [firestore node library](https://www.npmjs.com/package/@google-cloud/firestore). 

## Migration logic

1. Gather all the migration files and sort them according to semver
2. Find the last migration in the `fireblaze` collection
3. If the last migration failed, stop. (remove the failed migration result or restore the db to continue)
4. Run the migration scripts since the last migration

## Migration results

Migration results are stored in the `fireblaze` collection in `firestore`

```js
// /fireblaze/3-0.0.1-example

{
  checksum: 'fdfe6a55a7c97a4346cb59871b4ce97c',
  description: 'example',
  execution_time: 1221,
  installed_by: 'system_user_name',
  installed_on: firestore.Timestamp(),
  installed_rank: 3,
  script: 'v0.0.1__example.js',
  success: true,
  type: 'js',
  version: '0.0.1'
}
```

## Contributing

```bash
# To install packages and firestore emulator
$ yarn
$ yarn setup

# To run tests
$ yarn test
```

## License

MIT
