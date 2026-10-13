// Test fixture: a bridge process that dies right after starting, before
// reading anything (e.g. a Python import error after a hydroqc upgrade).
process.exit(1);
