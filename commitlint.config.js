export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', 'fix', 'docs', 'style', 'refactor',
        'perf', 'test', 'build', 'ci', 'chore', 'revert',
        'security', 'quantum', 'zkp', 'pqc',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'core', 'did', 'kyc', 'zkp', 'pqc', 'quantum',
        'ai', 'mcp', 'wasm', 'tee', 'storage', 'api',
        'sdk', 'docs', 'test', 'ci', 'deps', 'security',
        'fl', 'platform', 'helm', 'proto',
      ],
    ],
    'scope-case': [2, 'always', 'lower-case'],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};
