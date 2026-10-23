/** Compare domain clients to the backend's current OpenAPI, without a DB or network call. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const frontend = path.resolve(import.meta.dirname, '..');
const backend = path.resolve(frontend, '../backend');
const localPython = path.join(
  backend,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const python = process.env.PYTHON || (fs.existsSync(localPython) ? localPython : 'python3');
const exported = spawnSync(
  python,
  ['-c', 'import json; from app.main import app; print(json.dumps(app.openapi()))'],
  {
    cwd: backend,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      ENVIRONMENT: 'test',
      APP_BASE_URL: 'http://127.0.0.1:5173',
      CORS_ORIGINS: 'http://127.0.0.1:5173',
      DATABASE_URL: 'postgresql+psycopg://contract:contract@localhost/contract',
      JWT_ACCESS_SECRET: 'contract-fixture-access-proof-0000000000',
      PRELOGIN_SECRET: 'contract-fixture-prelogin-proof-00000000',
      MFA_ENCRYPTION_KEY: 'contract-fixture-mfa-proof-0000000000000',
      SMTP_HOST: '',
      SMTP_FROM: '',
      ENABLE_API_DOCS: 'false',
      EMAIL_OUTBOX_WORKER_ENABLED: 'false',
      EXPIRY_REMINDERS_ENABLED: 'false',
      RATE_LIMIT_ENABLED: 'false',
    },
  },
);
if (exported.status !== 0)
  throw new Error(
    'Cannot export backend OpenAPI. Install backend dependencies and set PYTHON if needed.\n' +
      exported.stderr,
  );
const schema = JSON.parse(exported.stdout);
const normalize = (value) => value.split('?')[0].replace(/\{[^}]*\}/g, '{}');
const operations = new Map();
for (const [url, methods] of Object.entries(schema.paths)) {
  for (const [method, operation] of Object.entries(methods))
    operations.set(`${method.toUpperCase()} ${normalize(url)}`, operation);
}

const name = (value) => 'Backend_' + value.replace(/[^\w]/g, '_');
function type(schema = {}) {
  if (schema.$ref) return name(schema.$ref.split('/').at(-1));
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  for (const [key, join] of [
    ['anyOf', ' | '],
    ['oneOf', ' | '],
    ['allOf', ' & '],
  ]) {
    if (schema[key]) return '(' + schema[key].map(type).join(join) + ')';
  }
  if (Array.isArray(schema.type))
    return schema.type.map((value) => type({ ...schema, type: value })).join(' | ');
  if (schema.type === 'array') return `(${type(schema.items)})[]`;
  if (schema.type === 'object' || schema.properties) {
    const members = Object.entries(schema.properties || {}).map(
      ([key, value]) => `${JSON.stringify(key)}${schema.required?.includes(key) ? '' : '?'}: ${type(value)}`,
    );
    if (schema.additionalProperties)
      members.push(
        `[key: string]: ${schema.additionalProperties === true ? 'unknown' : type(schema.additionalProperties)}`,
      );
    return members.length ? '{ ' + members.join('; ') + ' }' : 'Record<string, unknown>';
  }
  return (
    { string: 'string', integer: 'number', number: 'number', boolean: 'boolean', null: 'null' }[
      schema.type
    ] || 'unknown'
  );
}

const covered = new Set(['POST /api/auth/refresh']); // Transport owns cookie refresh.
const failures = [];
const definitions = Object.entries(schema.components.schemas).map(
  ([key, value]) => `type ${name(key)} = ${type(value)};`,
);
const assertions = [];
const imports = [];
let typed = 0;
const apiRoot = path.join(frontend, 'src/api');
for (const directory of fs
  .readdirSync(apiRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())) {
  const file = path.join(apiRoot, directory.name, 'api.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const declaration of source.statements.filter(ts.isVariableStatement)) {
    for (const item of declaration.declarationList.declarations) {
      if (!item.initializer || !ts.isObjectLiteralExpression(item.initializer)) continue;
      const object = item.name.getText(source);
      imports.push(`import { ${object} } from ${JSON.stringify(file.replaceAll('\\', '/'))};`);
      for (const property of item.initializer.properties) {
        const methodName = property.name.getText(source);
        const arrow = property.initializer;
        function visit(node) {
          if (ts.isCallExpression(node) && node.expression.getText(source) === 'apiFetch') {
            const arg = node.arguments[0];
            let url;
            if (ts.isStringLiteralLike(arg)) url = arg.text;
            else if (ts.isTemplateExpression(arg)) {
              url = arg.head.text;
              for (const span of arg.templateSpans) {
                // Conditional query suffixes do not contribute a path parameter.
                url += ts.isConditionalExpression(span.expression) ? '' : '{}';
                url += span.literal.text;
              }
            } else {
              failures.push(`${object}.${methodName}: URL must be statically auditable`);
              return;
            }
            const options = node.arguments[1];
            const properties = options && ts.isObjectLiteralExpression(options) ? options.properties : [];
            const verb =
              properties.find((prop) => prop.name?.getText(source) === 'method')?.initializer.text || 'GET';
            const key = `${verb} ${normalize('/api' + url)}`;
            const operation = operations.get(key);
            if (!operation) {
              failures.push(`${object}.${methodName}: unknown backend operation ${key}`);
              return;
            }
            covered.add(key);
            const response = Object.entries(operation.responses).find(([status]) => status.startsWith('2'));
            const responseSchema = response?.[1].content?.['application/json']?.schema?.properties?.data;
            const rawExpected = type(responseSchema);
            const expected =
              response?.[0] === '204'
                ? 'void'
                : rawExpected === 'unknown'
                  ? 'unknown'
                  : `Serialized<${rawExpected}>`;
            const expression = `Awaited<ReturnType<typeof ${object}.${methodName}>>`;
            if (expected !== 'unknown') {
              assertions.push(
                `// ${key}: ${object}.${methodName}\nconst response_${typed}: ${expected} = null as unknown as ${expression};\nconst reverse_${typed}: ${expression} = null as unknown as ${expected};`,
              );
              typed++;
            }
            const bodyIndex = arrow.parameters.findIndex(
              (parameter) => parameter.name.getText(source) === 'body',
            );
            const request = operation.requestBody?.content?.['application/json']?.schema;
            if (bodyIndex >= 0 && request)
              assertions.push(
                `// ${key}: request\nconst request_${typed++}: ${type(request)} = null as unknown as Parameters<typeof ${object}.${methodName}>[${bodyIndex}];`,
              );
          }
          ts.forEachChild(node, visit);
        }
        visit(arrow);
      }
    }
  }
}
const excluded = new Set(['GET /api/health', 'GET /api/machine/secrets']);
for (const operation of operations.keys())
  if (!covered.has(operation) && !excluded.has(operation))
    failures.push('Missing browser API wrapper: ' + operation);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultessa-contract-'));
try {
  const file = path.join(temporary, 'contract.ts');
  fs.writeFileSync(
    file,
    [
      'type Serialized<T> = T extends (infer U)[] ? Serialized<U>[] : T extends object ? { [K in keyof T]-?: Serialized<T[K]> } : T;',
      ...imports,
      ...definitions,
      ...assertions,
    ].join('\n'),
  );
  const program = ts.createProgram([file, path.join(frontend, 'node_modules/vite/client.d.ts')], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    types: [],
    typeRoots: [path.join(frontend, 'node_modules/@types')],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  for (const diagnostic of diagnostics) {
    const line =
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line
        : -1;
    const context =
      diagnostic.file && line >= 0
        ? diagnostic.file.text
            .split('\n')
            .slice(Math.max(0, line - 1), line + 1)
            .join(' ')
        : '';
    failures.push(context + '\n' + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  }
} finally {
  if (fs.existsSync(path.join(temporary, 'contract.ts'))) fs.unlinkSync(path.join(temporary, 'contract.ts'));
  fs.rmdirSync(temporary);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `API contract verified: ${covered.size} browser operations; ${typed} request/response assertions. Health and machine access are intentionally outside the browser client.`,
  );
