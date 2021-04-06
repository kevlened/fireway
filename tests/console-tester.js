const capcon = require('capture-console');

let buffer = '';
capcon.startCapture(process.stdout, o => buffer += o);
capcon.startCapture(process.stderr, o => buffer += o);

const tester = {
	includes: str => buffer.includes(str),
	lines: () => buffer.split('\n'),
	reset: () => buffer = ''
};

module.exports = tester;
