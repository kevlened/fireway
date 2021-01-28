'use strict';

const path = require('path');
const util = require('util');
const fs = require('fs');
const md5 = require('md5');
const semver = require('semver');

const readFile = util.promisify(fs.readFile);
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const exists = util.promisify(fs.exists);

const getFilesNewerThanVersion = (files, version) => files.filter(file => semver.gt(file.version, version));

const resolveFiles = async (dir, log) => {
    // Get all the scripts
    if (!path.isAbsolute(dir)) {
        dir = path.join(process.cwd(), dir);
    }

    if (!(await exists(dir))) {
        throw new Error(`No directory at ${dir}`);
    }

    const filenames = [];
    for (const file of await readdir(dir)) {
        if (!(await stat(path.join(dir, file))).isDirectory()) {
            filenames.push(file);
        }
    }

    // Parse the version numbers from the script filenames
    const versionToFile = new Map();
    return filenames
        .map(filename => {
            // Skip files that start with a dot
            if (filename[0] === '.') return;

            const [filenameVersion, description] = filename.split('__');
            const coerced = semver.coerce(filenameVersion);

            if (!coerced) {
                if (description) {
                    // If there's a description, we assume you meant to use this file
                    log(`WARNING: ${filename} doesn't have a valid semver version`);
                }
                return null;
            }

            // If there's a version, but no description, we have an issue
            if (!description) {
                throw new Error(`This filename doesn't match the required format: ${filename}`);
            }

            const { version } = coerced;

            const existingFile = versionToFile.get(version);
            if (existingFile) {
                throw new Error(`Both ${filename} and ${existingFile} have the same version`);
            }
            versionToFile.set(version, filename);

            return {
                filename,
                path: path.join(dir, filename),
                version,
                description: path.basename(description, '.js')
            };
        })
        .filter(Boolean)
        // sort files by semver
        .sort((f1, f2) => semver.compare(f1.version, f2.version));
}

const calculateFileHash = async path => md5(await readFile(path));

module.exports = {
    getFilesNewerThanVersion,
    resolveFiles,
    calculateFileHash,
}