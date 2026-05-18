const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const fileName = path.resolve(__dirname, "src/routes/auth.ts");
const program = ts.createProgram([fileName], {
  noEmit: true,
  strict: true,
  target: ts.ScriptTarget.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  esModuleInterop: true,
});

const diagnostics = ts.getPreEmitDiagnostics(program);

diagnostics.forEach((diagnostic) => {
  if (diagnostic.file && diagnostic.file.fileName === fileName) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    console.log(`Line ${line + 1}, Col ${character + 1}: ${message}`);
  }
});
